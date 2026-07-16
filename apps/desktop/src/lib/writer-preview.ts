export interface WriterPreviewBlob {
  previewId: string
  url: string
  size: number
  release: () => Promise<void>
}

export async function createWriterPreviewBlob(filePath: string, mimeType: string): Promise<WriterPreviewBlob> {
  const bridge = window.karnaDesktop?.writerPreview
  if (!bridge) {
    throw new Error('本地预览服务不可用')
  }

  const created = await bridge.create({ filePath })
  if (!created.ok || !created.previewId) {
    throw new Error(created.message || created.error || '创建预览失败')
  }

  const previewId = created.previewId
  try {
    const manifest = await bridge.get(previewId)
    if (!manifest.ok || manifest.format !== 'binary') {
      throw new Error(manifest.error || '预览数据格式无效')
    }

    const parts: ArrayBuffer[] = []
    const totalChunks = Number(manifest.totalChunks || 0)
    for (let index = 0; index < totalChunks; index += 1) {
      const chunk = await bridge.chunk(previewId, index)
      if (!chunk.ok || !chunk.data) {
        throw new Error(chunk.error || '读取预览分块失败')
      }
      const binary = window.atob(chunk.data)
      const bytes = new Uint8Array(binary.length)
      for (let offset = 0; offset < binary.length; offset += 1) {
        bytes[offset] = binary.charCodeAt(offset)
      }
      parts.push(bytes.buffer)
    }

    const url = URL.createObjectURL(new Blob(parts, { type: mimeType }))
    return {
      previewId,
      url,
      size: Number(manifest.size || 0),
      release: async () => {
        URL.revokeObjectURL(url)
        await bridge.release(previewId)
      }
    }
  } catch (error) {
    await bridge.release(previewId)
    throw error
  }
}
