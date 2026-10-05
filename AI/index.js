require('dotenv').config();

const express = require('express');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const say = require('say');
const { Annotation, StateGraph, MessagesAnnotation, START, END } = require('@langchain/langgraph');
const { ToolNode, toolsCondition } = require('@langchain/langgraph/prebuilt');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-pro',
    temperature: 0.7,
    maxRetries: 3,
});

const tools = [];
const toolsNode = new ToolNode(tools);
const model = tools.length > 0 ? llm.bindTools(tools) : llm;

const callLLM = async (state) => {

    const messages = state.messages;
    const response = await model.invoke(messages);

    return { messages: [response] };
};

const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", callLLM)
    // .addNode("tools", toolsNode)
    // .addEdge(START, "agent")
    // .addConditionalEdges("agent", toolsCondition)
    // .addEdge("tools", "agent")
    .addEdge("__start__", "agent")
    .addEdge("agent", "__end__")
    .compile();

app.post('/ai', async (req, res) => {
    try {
        const { prompt } = req.body || {};

        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await graph.invoke({
            messages: [{ role: "user", content: prompt.trim() }]
        });
        const lastMessage = result.messages[result.messages.length - 1];
        return res.json({ response: lastMessage.content });
    } catch (error) {
        console.error("AI route error:", error);
        return res.status(500).json({ error: error.message || 'Failed to process AI request' });
    }
});

async function generateText(prompt) {
    if (!llm) {
        throw new Error('GOOGLE_API_KEY is not configured');
    }

    const instruction = [
        'Answer the user request below.',
        'Return only valid JSON with exactly these fields: text and confidence.',
        'The text field must contain plain text only, without Markdown.',
        'The confidence field must be an estimated integer from 0 to 100 representing how confident you are in the answer.',
        `User request: ${prompt}`,
    ].join('\n');
    const result = await llm.invoke(instruction);
    const rawText = typeof result.content === 'string'
        ? result.content.trim()
        : result.content.map((part) => part.text || '').join('').trim();
    const jsonText = rawText.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    let parsed;

    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        console.error('AI route error:', error);
        return res
            .status(500)
            .json({ error: error.message || 'Failed to process AI request' });
    }
});

app.listen(port, () => {
    console.log(`LangChain / LangGraph learning server at http://localhost:${port}`);
});
