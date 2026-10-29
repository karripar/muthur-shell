export class TerminalAudio {
  private context?: AudioContext;
  private last = 0;
  tick(enabled: boolean, confirm = false) {
    if (!enabled || (!confirm && performance.now() - this.last < 65)) return;
    this.last = performance.now();
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
      const osc = this.context.createOscillator(),
        gain = this.context.createGain();
      osc.type = "sine";
      osc.frequency.value = confirm ? 440 : 1250;
      gain.gain.setValueAtTime(0.018, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.035,
      );
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start();
      osc.stop(this.context.currentTime + 0.04);
    } catch {
      /* Audio is optional when the platform denies activation. */
    }
  }
  dispose() {
    void this.context?.close();
  }
}
