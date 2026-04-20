export default function Badge({ children, tone = 'default' }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}
