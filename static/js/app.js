class VoiceAssistant {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');
        this.chatMessages = document.getElementById('chat-messages');
        this.isRunning = false;
        this.statusCheckInterval = null;

        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.stream = null;
        this.analyser = null;
        this.silenceTimer = null;
        this.silenceDuration = 2000; // 2 seconds
        this.lastSpokeTime = null;

        this.startBtn.addEventListener('click', () => this.startAssistant());
        this.stopBtn.addEventListener('click', () => this.stopAssistant());
    }

    async startAssistant() {
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.statusText.textContent = 'Listening...';
        this.statusIndicator.className = 'status-indicator recording';
        this.chatMessages.innerHTML = '';

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            source.connect(this.analyser);

            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.sendAudioToBackend(blob);
            };

            this.mediaRecorder.start();
            this.lastSpokeTime = Date.now();
            this.detectSilence();

            const res = await fetch('/api/start', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'started') {
                this.isRunning = true;
                this.startStatusCheck();
            } else {
                this.showError('Failed to start assistant');
            }
        } catch (err) {
            this.showError('🎤 Mic error: ' + err.message);
        }
    }

    detectSilence() {
        const bufferLength = this.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

        const checkSilence = () => {
            if (!this.isRunning) return;
            this.analyser.getByteTimeDomainData(dataArray);
            const isSpeaking = dataArray.some(value => Math.abs(value - 128) > 10);

            if (isSpeaking) {
                this.lastSpokeTime = Date.now();
            }

            const now = Date.now();
            if (now - this.lastSpokeTime > this.silenceDuration) {
                this.stopAssistant(); // Auto-stop on silence
                return;
            }

            requestAnimationFrame(checkSilence);
        };

        checkSilence();
    }

    sendAudioToBackend(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'input.webm');

        fetch('/api/audio', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.transcript) {
                this.addMessage(data.transcript, 'user');
            }
        })
        .catch(err => {
            this.showError('Error sending audio: ' + err.message);
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
        switch (message.type) {
            case 'user_speech':
            case 'user_answer':
                this.addMessage(message.text, 'user');
                break;
            case 'assistant_reply':
            case 'continue_prompt':
                this.addMessage(message.text, 'assistant');
                break;
            case 'status':
                this.statusText.textContent = message.text;
                this.statusIndicator.className = `status-indicator ${message.state}`;
                break;
        }
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    stopAssistant() {
        if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
        this.statusText.textContent = 'Stopped';
        this.statusIndicator.className = 'status-indicator ready';
        this.isRunning = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        if (this.audioContext) {
            this.audioContext.close();
        }

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    showError(message) {
        this.addMessage(message, 'error');
        this.stopAssistant();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});