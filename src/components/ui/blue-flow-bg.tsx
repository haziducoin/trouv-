export function BlueFlowBg({ fixed = false }: { fixed?: boolean }) {
  const gridStyle = {
    backgroundImage: [
      'linear-gradient(to right,  #dde6f5 1px, transparent 1px)',
      'linear-gradient(to bottom, #dde6f5 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: '6rem 4rem',
  }

  return (
    <div
      className="bfb-root"
      aria-hidden
      style={
        fixed
          ? { position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', ...gridStyle }
          : undefined
      }
    >
      <div className="bfb-blob bfb-1" />
      <div className="bfb-blob bfb-2" />
      <div className="bfb-blob bfb-3" />
      <div className="bfb-blob bfb-4" />
    </div>
  )
}
