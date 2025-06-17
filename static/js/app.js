class VoiceAssistant {
    constructor() {
        // DOM elements
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');
        this.chatMessages = document.getElementById('chat-messages');
        this.isRunning = false;
        this.statusCheckInterval = null;

        // Bind event listeners
        this.startBtn.addEventListener('click', () => this.startAssistant());
        this.stopBtn.addEventListener('click', () => this.stopAssistant());
    }

    startAssistant() {
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.statusText.textContent = 'Starting assistant...';
        this.chatMessages.innerHTML = ''; // Clear previous messages

        fetch('/api/start', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'started') {
                    this.isRunning = true;
                    this.startStatusCheck();
                } else {
                    this.showError('Failed to start assistant');
                }
            })
            .catch(error => {
                this.showError('Error starting assistant: ' + error.message);
            });
    }

    startStatusCheck() {
        this.statusCheckInterval = setInterval(() => {
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    if (data.messages) {
                        data.messages.forEach(msg => this.handleMessage(msg));
                    }
                    if (data.status === 'stopped') {
                        this.stopAssistant();
                    }
                })
                .catch(error => {
                    console.error('Error checking status:', error);
                });
        }, 1000);
    }

    handleMessage(message) {
        console.log('Received message:', message); // Debug log
        switch (message.type) {
            case 'user_speech':
                this.addMessage(message.text, 'user');
                break;
            case 'assistant_reply':
                this.addMessage(message.text, 'assistant');
                break;
            case 'user_answer':
                this.addMessage(message.text, 'user');
                if (message.action === 'end') {
                    this.stopAssistant();
                }
                break;
            case 'continue_prompt':
                this.addMessage(message.text, 'assistant');
                break;
            case 'status':
                this.statusText.textContent = message.text;
                if (message.state === 'recording') {
                    this.startBtn.disabled = true;
                    this.stopBtn.disabled = false;
                    this.statusIndicator.className = 'status-indicator recording';
                } else if (message.state === 'processing') {
                    this.startBtn.disabled = true;
                    this.stopBtn.disabled = true;
                    this.statusIndicator.className = 'status-indicator processing';
                } else if (message.state === 'ready') {
                    this.startBtn.disabled = false;
                    this.stopBtn.disabled = true;
                    this.statusIndicator.className = 'status-indicator ready';
                }
                break;
        }
    }

    addMessage(text, type) {
        console.log('Adding message:', text, type); // Debug log
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    stopAssistant() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
        this.isRunning = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.statusText.textContent = 'Ready to start';
        this.statusIndicator.className = 'status-indicator ready';
    }

    showError(message) {
        this.addMessage(message, 'error');
        this.stopAssistant();
    }
}

// Initialize the assistant when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
}); 