require('dotenv').config();

const path = require('path');
const express = require('express');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const say = require('say');
const { Annotation, StateGraph } = require('@langchain/langgraph');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
})

const callLLM = async (state) => {
    console.log("Current state:", state);
    const prompt = state.prompt;
    const response = await llm.invoke([
        {
            role: "user",
            content: prompt,
        }
    ]);
    const textContent = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
            ? response.content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('')
            : String(response.content || '');
    return { aiMsg: textContent, response: textContent, confidence: null };
}

const graph = new StateGraph(state).addNode("agent", callLLM).addEdge("__start__", "agent").addEdge("agent", "__end__").compile();

app.post("/ai", async (req, res) => {
    try {
        const { prompt } = req.body || {};

        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const response = await graph.invoke({ prompt: prompt.trim() });
        return res.json({ response: response.response, confidence: response.confidence });
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
        parsed = { text: rawText, confidence: null };
    }

    const text = String(parsed.text || rawText)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+[.)]\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim();
    const confidence = Number(parsed.confidence);

    return {
        text,
        confidence: Number.isFinite(confidence)
            ? Math.max(0, Math.min(100, Math.round(confidence)))
            : null,
    };
}


app.post('/generate-text', async (request, response) => {
    const { prompt } = request.body || {};

    if (!prompt || typeof prompt !== 'string') {
        return response.status(400).json({ error: 'Prompt is required' });
    }

    try {
        const result = await generateText(prompt.trim());
        response.json(result);
    } catch (error) {
        console.error(error.message);
        response.status(500).json({ error: 'Could not generate text' });
    }
});

app.post('/speak', (request, response) => {
    const { text, voice, speed } = request.body || {};

    if (!text || typeof text !== 'string') {
        return response.status(400).json({ error: 'Text is required' });
    }

    const speechSpeed = Number(speed) || 1;
    if (speechSpeed < 0.5 || speechSpeed > 2) {
        return response.status(400).json({ error: 'Speed must be between 0.5 and 2' });
    }

    say.speak(text, voice || undefined, speechSpeed, (error) => {
        if (error) {
            console.error(error.message);
            return response.status(500).json({ error: 'Could not speak text' });
        }

        response.json({ message: 'Speech completed' });
    });
});

app.post('/stop-speech', (request, response) => {
    say.stop(() => {
        response.json({ message: 'Speech stopped' });
    });
});

app.get('/voices', (request, response) => {
    say.getInstalledVoices((error, voices) => {
        if (error) {
            console.error(error.message);
            return response.status(500).json({ error: 'Could not load voices' });
        }

        response.json({ voices });
    });
});

app.get('/health', (request, response) => {
    response.json({ status: 'ok' });
});

app.use((request, response) => {
    response.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
