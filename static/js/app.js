class VoiceAssistant {
    constructor() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');
        this.chatMessages = document.getElementById('chat-messages');
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.silenceTimer = null;

        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecordingManually());
    }

    async startRecording() {
        this.statusText.textContent = "Recording...";
        this.statusIndicator.className = 'status-indicator recording';
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.audioChunks = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => this.onRecordingStop();

            this.mediaRecorder.start();
            this.resetSilenceDetection();
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const processor = audioCtx.createScriptProcessor(2048, 1, 1);

            processor.onaudioprocess = event => {
                const input = event.inputBuffer.getChannelData(0);
                const isSilent = input.every(sample => Math.abs(sample) < 0.01);
                if (!isSilent) {
                    this.resetSilenceDetection();
                }
            };

            source.connect(processor);
            processor.connect(audioCtx.destination);

            this.silenceTimer = setTimeout(() => {
                processor.disconnect();
                source.disconnect();
                this.mediaRecorder.stop();
                stream.getTracks().forEach(track => track.stop());
            }, 3000); // stop after 3 seconds of silence

        } catch (error) {
            this.showError("🎤 Mic error: " + error.message);
            this.statusIndicator.className = 'status-indicator ready';
        }
    }

    resetSilenceDetection() {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        }, 3000); // 3 seconds of silence
    }

    stopRecordingManually() {
        this.statusText.textContent = "Stopping manually...";
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }

    onRecordingStop() {
        this.statusText.textContent = "Recording complete.";
        this.stopBtn.disabled = true;
        this.startBtn.disabled = false;
        this.statusIndicator.className = 'status-indicator ready';

        const blob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append("file", blob, "audio.wav");

        this.statusText.textContent = "Sending to server...";
        fetch("/api/audio", {
            method: "POST",
            body: formData
        })
        .then(res => {
            if (!res.ok) throw new Error("Failed to send audio");
            return res.json();
        })
        .then(data => {
            this.statusText.textContent = "✅ Audio sent!";
            if (data.reply) this.addMessage(data.reply, 'assistant');
        })
        .catch(err => {
            this.showError("Error sending audio: " + err.message);
        });
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showError(message) {
        this.statusText.textContent = message;
        this.addMessage(message, 'error');
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.statusIndicator.className = 'status-indicator ready';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});