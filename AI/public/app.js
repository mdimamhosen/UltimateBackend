const form = document.querySelector('#prompt-form');
const promptInput = document.querySelector('#prompt');
const result = document.querySelector('#result');
const responseLabel = document.querySelector('#response-label');
const confidence = document.querySelector('#confidence');
const statusMessage = document.querySelector('#status-message');
const generateButton = document.querySelector('#generate-button');
const speakButton = document.querySelector('#speak-button');
const stopButton = document.querySelector('#stop-button');
const voiceInput = document.querySelector('#voice');
const speedInput = document.querySelector('#speed');
const speedValue = document.querySelector('#speed-value');

let generatedText = '';

async function loadVoices() {
  try {
    const response = await fetch('/voices');
    const data = await response.json();
    data.voices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice;
      option.textContent = voice;
      voiceInput.append(option);
    });
  } catch (error) {
    setStatus('Could not load system voices.');
  }
}

function setStatus(message) {
  statusMessage.textContent = message;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!promptInput.value.trim()) {
    setStatus('Enter a prompt first.');
    promptInput.focus();
    return;
  }

  generateButton.disabled = true;
  responseLabel.textContent = 'Generating';
  setStatus('Asking Gemini...');

  try {
    const response = await fetch('/generate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptInput.value.trim(),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not generate an answer.');
    }

    generatedText = data.text;
    result.textContent = generatedText;
    confidence.textContent = data.confidence === null
      ? 'Confidence: unavailable'
      : `Confidence: ${data.confidence}% (AI estimate)`;
    responseLabel.textContent = 'Ready';
    setStatus('Answer generated.');
  } catch (error) {
    responseLabel.textContent = 'Error';
    setStatus(error.message);
  } finally {
    generateButton.disabled = false;
  }
});

speakButton.addEventListener('click', async () => {
  if (!generatedText) {
    setStatus('Generate an answer before speaking it.');
    return;
  }

  speakButton.disabled = true;
  setStatus('Speaking on the server...');

  try {
    const response = await fetch('/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: generatedText,
        voice: voiceInput.value,
        speed: Number(speedInput.value),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not speak the answer.');
    }

    setStatus(data.message);
  } catch (error) {
    setStatus(error.message);
  } finally {
    speakButton.disabled = false;
  }
});

stopButton.addEventListener('click', async () => {
  await fetch('/stop-speech', { method: 'POST' });
  setStatus('Speech stopped.');
  speakButton.disabled = false;
});

speedInput.addEventListener('input', () => {
  speedValue.textContent = `${Number(speedInput.value).toFixed(1)}x`;
});

loadVoices();
