import { cn } from '@/lib/utils'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

type BrandMarkVariant = 'about' | 'titlebar' | 'app-icon'

interface BrandMarkProps extends React.ComponentProps<'span'> {
  variant?: BrandMarkVariant
  size?: number
}

const sizeMap: Record<BrandMarkVariant, string> = {
  about: 'size-16',
  titlebar: 'size-6',
  'app-icon': 'size-14'
}

export function BrandMark({ className, variant = 'app-icon', size, ...props }: BrandMarkProps) {
  const sizeClass = size ? undefined : sizeMap[variant]
  const style = size ? { width: size, height: size } : undefined

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white',
        sizeClass,
        className
      )}
      style={style}
      {...props}
    >
      <img alt="" className="size-full object-contain" src={assetPath('Karna.png')} />
    </span>
  )
}
