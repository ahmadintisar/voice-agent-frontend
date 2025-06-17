class VoiceAssistant {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');
        this.chatMessages = document.getElementById('chat-messages');
        this.isRunning = false;
        this.mediaRecorder = null;
        this.silenceTimer = null;
        this.audioChunks = [];

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

            processor.onaudioprocess = event => {
                const input = event.inputBuffer.getChannelData(0);
                const volume = input.reduce((acc, val) => acc + Math.abs(val), 0) / input.length;
                if (volume > 0.002) this.resetSilenceDetection();
            };

            source.connect(processor);
            processor.connect(context.destination);

            this.silenceTimer = setTimeout(() => {
                processor.disconnect();
                source.disconnect();
                this.mediaRecorder.stop();
                stream.getTracks().forEach(track => track.stop());
            }, 6000);

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
                this.setStatus("Recording complete. Sending...", "processing");

                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.sendAudioStream(audioBlob);

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

    sendAudioStream(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'input.wav');

        fetch("https://63f3-110-93-223-224.ngrok-free.app/api/stream-process-audio", {
            method: "POST",
            body: formData
        }).then(response => {
            if (!response.ok || !response.body) {
                throw new Error("Failed to connect to stream.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let partialData = "";

            const readStream = () => {
                reader.read().then(({ value, done }) => {
                    if (done) return;

                    partialData += decoder.decode(value, { stream: true });
                    const chunks = partialData.split("\n\n");
                    partialData = chunks.pop();

                    chunks.forEach(chunk => {
                        if (chunk.startsWith("data: ")) {
                            const payload = JSON.parse(chunk.replace("data: ", ""));
                            this.handleStreamedEvent(payload);
                        }
                    });

                    readStream();
                });
            };

            readStream();
        }).catch(err => {
            this.showError("Error sending audio: " + err.message);
        });
    }

    handleStreamedEvent(payload) {
        if (payload.type === "transcript") {
            this.addMessage(payload.value, "user");
        } else if (payload.type === "gpt") {
            this.addMessage("GPT Response: " + payload.value, "assistant");
        } else if (payload.type === "audio") {
            this.setStatus("Playing response...", "ready");
            const audio = new Audio(`https://63f3-110-93-223-224.ngrok-free.app${payload.value}`);
            audio.play();
        } else if (payload.status === "error") {
            this.showError("Server Error: " + payload.message);
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