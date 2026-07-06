class AudioProcessor {
  constructor(options = {}) {
    this.env = options.env || process.env;
  }

  async transcribe(message) {
    const providedTranscript = message.transcript || message.raw?.transcript || message.raw?.messageData?.fileMessageData?.caption;
    if (providedTranscript && String(providedTranscript).trim()) {
      return {
        status: 'ready',
        transcript: String(providedTranscript).trim(),
        confidence: 0.95,
        source: 'provided',
      };
    }

    if (!message.fileUrl) {
      return {
        status: 'missing_audio',
        transcript: '',
        confidence: 0,
        source: 'none',
      };
    }

    if (String(this.env.AI_CONSULTANT_AUDIO_DRY_RUN || 'true') === 'true') {
      return {
        status: 'needs_transcription',
        transcript: '',
        confidence: 0,
        source: 'dry_run',
        fileUrl: message.fileUrl,
      };
    }

    return {
      status: 'unsupported',
      transcript: '',
      confidence: 0,
      source: 'not_configured',
      fileUrl: message.fileUrl,
    };
  }
}

module.exports = { AudioProcessor };
