import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { NEW_CHAT_ROUTE } from './routes'

export function NotFoundView() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Codicon className="text-6xl text-(--ui-text-quaternary)" name="search-stop" />
        <h1 className="text-2xl font-semibold">页面未找到</h1>
        <p className="max-w-md text-sm text-(--ui-text-secondary)">
          您访问的页面不存在或已被移动。
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => navigate(-1)} variant="outline">
          <Codicon name="arrow-left" size="0.875rem" />
          返回上一页
        </Button>
        <Button onClick={() => navigate(NEW_CHAT_ROUTE)} variant="default">
          <Codicon name="home" size="0.875rem" />
          返回主页
        </Button>
      </div>
    </div>
  )
}
