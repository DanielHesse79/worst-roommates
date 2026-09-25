// DOM speech balloons follow their speakers, stay in the scene area, and avoid each other.
export class SpeechView {
  constructor(view) {
    this.view = view;
    this.nodes = new Map();
  }

  clear() {
    for (const el of this.nodes.values()) el.remove();
    this.nodes.clear();
  }

  render() {
    const v = this.view, dialogue = v.game.dialogue;
    const blocked = !!document.querySelector('.modal:not(.hidden)');
    const occupied = [];
    const width = window.innerWidth, height = window.innerHeight;
    const sidebar = document.getElementById('sidebar').getBoundingClientRect();
    const right = sidebar.width && sidebar.left > width / 2 ? sidebar.left - 14 : width - 14;
    const top = document.getElementById('topbar').getBoundingClientRect().bottom + 12;
    const panel = document.getElementById('simPanel').getBoundingClientRect();
    for (const [id, el] of this.nodes) {
      if (!dialogue.enabled || !dialogue.active.has(id)) { el.remove(); this.nodes.delete(id); }
    }
    for (const [id, bubble] of dialogue.active) {
      let el = this.nodes.get(id);
      if (!el) {
        el = document.createElement('div'); el.className = 'speechBubble';
        const who = document.createElement('small'), line = document.createElement('span');
        el.append(who, line); v.overlay.appendChild(el); this.nodes.set(id, el);
      }
      el.firstChild.textContent = bubble.sim.first;
      el.lastChild.textContent = bubble.text;
      el.dataset.tone = bubble.priority >= 2 ? 'alarm' : 'chat';
      el.style.display = blocked ? 'none' : '';
      if (blocked) continue;
      const mine = bubble.sim === v.game.player && v.eyesOpen();
      const [sx, sy] = mine ? [width / 2, height - 60] : v.project(bubble.sim.x, bubble.sim.status.swimming ? 1.15 : 1.9, bubble.sim.z);
      if (sx < 0 || sx > width || sy < top || sy > height - 50) { el.style.display = 'none'; continue; }
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = Math.max(68, Math.min(right - w, sx - w / 2));
      let y = Math.max(top, Math.min(height - h - 95, sy - h - 18));
      if (x < panel.right && y + h > panel.top) y = panel.top - h - 12;
      for (const other of occupied) {
        if (x < other.x + other.w + 8 && x + w + 8 > other.x && y < other.y + other.h + 8 && y + h + 8 > other.y) {
          y = other.y - h - 12;
        }
      }
      // Skip a balloon when the available space is too small to keep it readable.
      if (y < top) { el.style.display = 'none'; continue; }
      occupied.push({ x, y, w, h });
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.style.setProperty('--tail', `${Math.max(18, Math.min(w - 18, sx - x))}px`);
      el.style.opacity = String(Math.min(1, bubble.left / 0.35));
    }
  }
}
