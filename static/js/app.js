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
        this.mediaRecorder = null;
        this.silenceTimer = null;
        this.audioChunks = [];

        // Bind event listeners
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
    }

    async startRecording() {
        try {
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.setStatus("Listening...", "recording");

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const context = new AudioContext();
            const source = context.createMediaStreamSource(stream);
            const processor = context.createScriptProcessor(2048, 1, 1);

            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };
            this.mediaRecorder.start();

            // Silence detection setup
            processor.onaudioprocess = event => {
                const input = event.inputBuffer.getChannelData(0);
                const volume = input.reduce((acc, val) => acc + Math.abs(val), 0) / input.length;

                if (volume > 0.002) {
                    this.resetSilenceDetection();
                }
            };

            source.connect(processor);
            processor.connect(context.destination);

            this.silenceTimer = setTimeout(() => {
                processor.disconnect();
                source.disconnect();
                this.mediaRecorder.stop();
                stream.getTracks().forEach(track => track.stop());
            }, 6000); // <-- Increased from 3000ms to 6000ms

            this.resetSilenceDetection = () => {
                clearTimeout(this.silenceTimer);
                this.silenceTimer = setTimeout(() => {
                    processor.disconnect();
                    source.disconnect();
                    this.mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                }, 6000);
            };

            this.mediaRecorder.onstop = () => {
                this.setStatus("Recording complete. Sending audio...", "processing");

                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                const formData = new FormData();
                formData.append('audio', audioBlob, 'input.wav');

                fetch('/api/audio', {
                    method: 'POST',
                    body: formData
                })
                .then(res => {
                    if (!res.ok) throw new Error("Failed to send audio");
                    return res.json();
                })
                .then(data => {
                    this.setStatus("Response received. Ready.", "ready");
                    if (data.reply) this.addMessage(data.reply, "assistant");
                })
                .catch(err => {
                    this.showError("Error sending audio: " + err.message);
                });

                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
            };
        } catch (error) {
            this.showError("🎤 Mic error: " + error.message);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.setStatus("Stopping manually...", "processing");
        }
    }

    setStatus(text, state) {
        this.statusText.textContent = text;
        this.statusIndicator.className = "status-indicator " + state;
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showError(message) {
        this.addMessage(message, "error");
        this.setStatus("Error", "ready");
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});