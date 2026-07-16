import { CodeEditor as BaseCodeEditor } from '@/components/chat/code-editor'

import type { EditorProps } from './editor-registry'

export function CodeEditorWrapper({ filePath, content, onChange, onSave }: EditorProps) {
  return (
    <BaseCodeEditor
      filePath={filePath}
      initialValue={content}
      key={filePath}
      onChange={onChange}
      onSave={onSave}
    />
  )
}
