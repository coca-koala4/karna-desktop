import { createServer } from 'net'

export function getAvailablePort(startPort: number = 8765, endPort: number = 9000): Promise<number> {
  return new Promise((resolve, reject) => {
    function tryPort(port: number) {
      if (port > endPort) {
        reject(new Error(`No available ports between ${startPort} and ${endPort}`))
        return
      }

      const server = createServer()
      server.listen(port, '127.0.0.1', () => {
        const { port: availablePort } = server.address() as { port: number }
        server.close(() => resolve(availablePort))
      })
      server.on('error', () => {
        tryPort(port + 1)
      })
    }

    tryPort(startPort + Math.floor(Math.random() * (endPort - startPort)))
  })
}
