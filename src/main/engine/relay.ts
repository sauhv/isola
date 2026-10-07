import { Server } from 'proxy-chain'

/**
 * Proxy relay cục bộ cho một profile: Chrome nói HTTP proxy với 127.0.0.1:{port},
 * relay nối upstream (http/https/socks5) có auth.
 *
 * Kill-switch: prepareRequestFunction luôn trả upstream. proxy-chain chỉ đi thẳng khi upstream
 * rỗng, nên upstream lỗi thì request lỗi (502), không bao giờ ra mạng bằng IP máy.
 * Password chỉ nằm trong `upstreamUrl` ở bộ nhớ, không log, không ghi đĩa.
 */
export class Relay {
  private constructor(private readonly server: Server) {}

  static async start(upstreamUrl: string): Promise<Relay> {
    if (!upstreamUrl) throw new Error('Relay cần upstream')
    const server = new Server({
      host: '127.0.0.1',
      port: 0,
      verbose: false,
      prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl })
    })
    // Lỗi từng request (upstream chết, bị từ chối) đã trả về Chrome dưới dạng 502; không để nó làm sập main.
    server.on('requestFailed', () => {})
    await server.listen()
    return new Relay(server)
  }

  get port(): number {
    return this.server.port
  }

  get proxyServerArg(): string {
    return `http://127.0.0.1:${this.port}`
  }

  close(): Promise<void> {
    return this.server.close(true)
  }
}
