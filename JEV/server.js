const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3002;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const schema = {
  intent: {
    type: 'choice',
    options: ['refund', 'cancellation', 'technical_issue', 'general_question', 'spam'],
  },
  urgency: {
    type: 'score',
    scale: ['low', 'medium', 'high'],
  },
  requires_human: {
    type: 'noul',
  },
};

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function classifyMessage(input) {
  const text = input.toLowerCase();
  let intent = 'general_question';
  let intentProbabilities = {
    refund: 0.05,
    cancellation: 0.05,
    technical_issue: 0.05,
    general_question: 0.8,
    spam: 0.05,
  };

  if (includesAny(text, ['refund', 'money back', 'charged'])) {
    intent = 'refund';
    intentProbabilities = { refund: 0.82, cancellation: 0.08, technical_issue: 0.04, general_question: 0.05, spam: 0.01 };
  } else if (includesAny(text, ['cancel', 'unsubscribe', 'subscription'])) {
    intent = 'cancellation';
    intentProbabilities = { refund: 0.12, cancellation: 0.78, technical_issue: 0.03, general_question: 0.06, spam: 0.01 };
  } else if (includesAny(text, ['error', 'bug', 'broken', 'cannot log', 'not working', 'failed'])) {
    intent = 'technical_issue';
    intentProbabilities = { refund: 0.02, cancellation: 0.03, technical_issue: 0.86, general_question: 0.08, spam: 0.01 };
  } else if (includesAny(text, ['buy now', 'click here', 'free money', 'prize'])) {
    intent = 'spam';
    intentProbabilities = { refund: 0.01, cancellation: 0.01, technical_issue: 0.01, general_question: 0.02, spam: 0.95 };
  }

  const urgency = includesAny(text, ['urgent', 'immediately', 'asap', 'locked out', 'security'])
    ? 'high'
    : includesAny(text, ['soon', 'quickly', 'important'])
      ? 'medium'
      : 'low';
  const urgencyProbabilities = urgency === 'high'
    ? { low: 0.03, medium: 0.12, high: 0.85 }
    : urgency === 'medium'
      ? { low: 0.12, medium: 0.76, high: 0.12 }
      : { low: 0.82, medium: 0.15, high: 0.03 };
  const requiresHuman = urgency === 'high' || intent === 'refund' || intent === 'technical_issue';
  const intentConfidence = Math.max(...Object.values(intentProbabilities));
  const urgencyConfidence = Math.max(...Object.values(urgencyProbabilities));

  return {
    answers: {
      intent: { value: intent, probabilities: intentProbabilities },
      urgency: { value: urgency, probabilities: urgencyProbabilities },
      requires_human: { value: requiresHuman, probability: requiresHuman ? 0.84 : 0.88 },
    },
    confidence: Math.round(((intentConfidence + urgencyConfidence) / 2) * 100) / 100,
    action: requiresHuman ? 'Route to a human support agent' : 'Handle with the normal support flow',
    mode: 'local-demo',
  };
}

app.get('/api/schema', (request, response) => {
  response.json(schema);
});

app.post('/api/classify', (request, response) => {
  const { input } = request.body;

  if (!input || typeof input !== 'string' || !input.trim()) {
    return response.status(400).json({ error: 'Input is required' });
  }

  response.json(classifyMessage(input.trim()));
});

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok', mode: 'local-demo' });
});

app.use((request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
  console.log(`Jev decision demo running at http://localhost:${port}`);
});
