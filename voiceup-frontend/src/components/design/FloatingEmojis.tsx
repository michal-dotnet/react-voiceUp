/** A row of floating emojis at the bottom of a page (decorative only). */
const emojis = [
  { emoji: "📣", right: "4%", delay: "0s" },
  { emoji: "💡", right: "24%", delay: "0.8s" },
  { emoji: "🏙️", right: "46%", delay: "1.6s" },
  { emoji: "👍", right: "68%", delay: "2.4s" },
  { emoji: "✨", right: "88%", delay: "3.2s" },
];

const FloatingEmojis = () => (
  <div className="vu-floaties" aria-hidden="true">
    {emojis.map((item) => (
      <span key={item.emoji} style={{ right: item.right, animationDelay: item.delay }}>
        {item.emoji}
      </span>
    ))}
  </div>
);

export default FloatingEmojis;
