const form = document.querySelector('#classify-form');
const input = document.querySelector('#input');
const status = document.querySelector('#status');
const empty = document.querySelector('#empty');
const decision = document.querySelector('#decision');
const action = document.querySelector('#action');
const intent = document.querySelector('#intent');
const urgency = document.querySelector('#urgency');
const human = document.querySelector('#human');
const confidence = document.querySelector('#confidence');
const probabilities = document.querySelector('#probabilities');

function titleCase(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderProbabilities(values) {
  probabilities.innerHTML = '';
  Object.entries(values).forEach(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'probability';
    row.innerHTML = `<span>${titleCase(key)}</span><span class="track"><i style="width: ${value * 100}%"></i></span><b>${Math.round(value * 100)}%</b>`;
    probabilities.append(row);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();

  if (!message) {
    status.textContent = 'Enter a customer message first.';
    input.focus();
    return;
  }

  status.textContent = 'Making a structured decision...';
  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: message }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Classification failed.');

    empty.hidden = true;
    decision.hidden = false;
    action.textContent = data.action;
    intent.textContent = titleCase(data.answers.intent.value);
    urgency.textContent = titleCase(data.answers.urgency.value);
    human.textContent = data.answers.requires_human.value ? 'Yes' : 'No';
    confidence.textContent = `Confidence ${Math.round(data.confidence * 100)}%`;
    renderProbabilities(data.answers.intent.probabilities);
    status.textContent = `Decision complete via ${data.mode}.`;
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelectorAll('[data-example]').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.example;
    input.focus();
  });
});
