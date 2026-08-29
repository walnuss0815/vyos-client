export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">{title}</h1>
      <p className="text-sm text-slate-400">
        This page is planned but not yet implemented. In the meantime, use the{' '}
        <span className="text-slate-300">Config Tree</span> page to edit this part of the
        configuration directly.
      </p>
    </div>
  )
}
