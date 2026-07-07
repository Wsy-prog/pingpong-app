type StatusVariant = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

function getStatusConfig(status: StatusVariant) {
  switch (status) {
    case 'completed':
      return { label: '已结束', className: 'bg-green-100 text-green-700' }
    case 'in_progress':
      return { label: '进行中', className: 'bg-yellow-100 text-yellow-700' }
    default:
      return { label: '未开始', className: 'bg-gray-100 text-gray-600' }
  }
}

export function StatusBadge({ status }: { status: StatusVariant }) {
  const { label, className } = getStatusConfig(status)

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}
