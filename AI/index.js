require('dotenv').config();

const express = require('express');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { TavilySearch } = require('@langchain/tavily');

const {
    StateGraph,
    MessagesAnnotation,
    START,
    END,
    MemorySaver,
} = require('@langchain/langgraph');

const { ToolNode } = require('@langchain/langgraph/prebuilt');


const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());


// =====================================================
// 1. TOOLS
// =====================================================

const websiteTool = new TavilySearch({
    maxResults: 3,
    topic: 'general',
});

const tools = [websiteTool];

const toolsNode = new ToolNode(tools);


// =====================================================
// 2. LLM
// =====================================================

const llm = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-pro',
    temperature: 0.7,
    maxRetries: 3,
});

const model = llm.bindTools(tools);


// =====================================================
// 3. SYSTEM PROMPT
// =====================================================

const systemMessage = {
    role: 'system',
    content: `
You are a helpful AI assistant.

You have access to a web search tool.

Use the web search tool when:
- The user asks for current information.
- The user asks for recent news.
- The user asks about something that may have changed recently.
- The user asks you to search the web.
- You need external information to answer accurately.

When web search results are available, use them to formulate your answer.

Do not claim that you cannot access the web when the web search tool
can provide relevant information.

For questions that do not require current information, answer directly.
`,
};


// =====================================================
// 4. MEMORY
// =====================================================

const memory = new MemorySaver();


// =====================================================
// 5. AGENT NODE
// =====================================================

const callLLM = async (state) => {

    // The graph already gives us the conversation history.
    // We only need to send that history to Gemini.

    const messages = [
        systemMessage,
        ...state.messages,
    ];

    const response = await model.invoke(messages);


    console.log('\n========== LLM RESPONSE ==========');

    console.log(response);


    if (response.tool_calls?.length > 0) {

        console.log('\n========== TOOL CALLS ==========');

        for (const toolCall of response.tool_calls) {

            console.log({
                name: toolCall.name,
                args: toolCall.args,
            });
        }
    }


    return {
        messages: [response],
    };
};


// =====================================================
// 6. DECIDE WHETHER TO CONTINUE
// =====================================================

const shouldContinue = (state) => {

    const lastMessage =
        state.messages[state.messages.length - 1];


    console.log('\n========== ROUTER ==========');


    if (lastMessage.tool_calls?.length > 0) {

        console.log('→ Calling tools');

        return 'tools';
    }


    console.log('→ Ending conversation');

    return END;
};


// =====================================================
// 7. LANGGRAPH
// =====================================================

const graph = new StateGraph(MessagesAnnotation)

    // Agent node
    .addNode('agent', callLLM)

    // Tool node
    .addNode('tools', toolsNode)

    // START → Agent
    .addEdge(START, 'agent')

    // Tools → Agent
    .addEdge('tools', 'agent')

    // Agent → Tools OR END
    .addConditionalEdges(
        'agent',
        shouldContinue
    )

    // Enable memory
    .compile({
        checkpointer: memory,
    });


// =====================================================
// 8. API
// =====================================================

app.post('/ai', async (req, res) => {

    try {

        const { prompt, threadId } = req.body || {};


        // ---------------------------------------------
        // Validate prompt
        // ---------------------------------------------

        if (
            !prompt ||
            typeof prompt !== 'string' ||
            !prompt.trim()
        ) {

            return res.status(400).json({
                error: 'Prompt is required',
            });
        }


        // ---------------------------------------------
        // Thread ID
        // ---------------------------------------------

        const conversationId =
            threadId || 'user-1';


        console.log('\n================================');
        console.log('THREAD ID:');
        console.log(conversationId);

        console.log('\nUSER PROMPT:');
        console.log(prompt);

        console.log('================================\n');


        // ---------------------------------------------
        // Invoke Graph
        // ---------------------------------------------

        const result = await graph.invoke(
            {
                messages: [
                    {
                        role: 'user',
                        content: prompt.trim(),
                    },
                ],
            },
            {
                configurable: {
                    thread_id: conversationId,
                },
            }
        );


        // ---------------------------------------------
        // Get final response
        // ---------------------------------------------

        const lastMessage =
            result.messages[result.messages.length - 1];


        return res.json({
            response: lastMessage.content,
            threadId: conversationId,
            confidence: null,
        });


    } catch (error) {

        console.error('\nAI route error:', error);


        return res.status(500).json({
            error:
                error.message ||
                'Failed to process AI request',
        });
    }
});


// =====================================================
// 9. START SERVER
// =====================================================

app.listen(port, () => {

    console.log(
        `LangChain / LangGraph server running at http://localhost:${port}`
    );

});