require('dotenv').config();

const express = require('express');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { Annotation, StateGraph } = require('@langchain/langgraph');
const { ToolNode } = require('@langchain/langgraph/prebuilt');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-pro',
    temperature: 0.7,
    maxRetries: 3,
});

const state = Annotation.Root({
    prompt: Annotation,
    aiMsg: Annotation,
    userMsg: Annotation,
    response: Annotation,
    confidence: Annotation,
});

const callLLM = async (state) => {
    console.log('Current state:', state);
    const prompt = state.prompt;
    const response = await llm.invoke([
        {
            role: 'user',
            content: prompt,
        },
    ]);
    const textContent =
        typeof response.content === 'string'
            ? response.content
            : Array.isArray(response.content)
              ? response.content
                    .map((part) =>
                        typeof part === 'string' ? part : part.text || '',
                    )
                    .join('')
              : String(response.content || '');
    return { aiMsg: textContent, response: textContent, confidence: null };
};

const tools = [];
const toolsNode = new ToolNode(tools);

const graph = new StateGraph(state)
    .addNode('agent', callLLM)
    .addNode('tools', toolsNode)
    .addEdge('__start__', 'agent')
    .addEdge('agent', '__end__')
    .compile();

app.post('/ai', async (req, res) => {
    try {
        const { prompt } = req.body || {};

        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await graph.invoke({ prompt: prompt.trim() });
        return res.json({
            response: result.response,
            confidence: result.confidence,
        });
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
