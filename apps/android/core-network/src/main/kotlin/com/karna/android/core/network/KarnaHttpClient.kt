package com.karna.android.core.network

import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Protocol
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

object KarnaHttpClient {

    private const val CONNECT_TIMEOUT_SECONDS = 30L
    private const val READ_TIMEOUT_SECONDS = 30L
    private const val WRITE_TIMEOUT_SECONDS = 30L
    private const val MAX_IDLE_CONNECTIONS = 5
    private const val KEEP_ALIVE_DURATION_MINUTES = 5L

    fun create(): OkHttpClient {
        val trustManager = createDynamicTrustManager()
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf<TrustManager>(trustManager), java.security.SecureRandom())

        return OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .connectionPool(
                ConnectionPool(
                    MAX_IDLE_CONNECTIONS,
                    KEEP_ALIVE_DURATION_MINUTES,
                    TimeUnit.MINUTES
                )
            )
            .certificatePinner(KarnaCertificatePinner.create())
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
            .retryOnConnectionFailure(true)
            .followRedirects(false)
            .followSslRedirects(false)
            .hostnameVerifier { hostname, _ ->
                isTrustedHostname(hostname)
            }
            .build()
    }

    fun createForLan(): OkHttpClient {
        val trustManager = createAllTrustManager()
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf<TrustManager>(trustManager), java.security.SecureRandom())

        return OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .connectionPool(ConnectionPool(2, 1, TimeUnit.MINUTES))
            .certificatePinner(KarnaCertificatePinner.createForLan())
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
            .retryOnConnectionFailure(false)
            .followRedirects(false)
            .followSslRedirects(false)
            .hostnameVerifier { _, _ -> true }
            .build()
    }

    private fun createDynamicTrustManager(): X509TrustManager {
        val trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        trustManagerFactory.init(null as KeyStore?)
        val defaultTrustManager = trustManagerFactory.trustManagers
            .filterIsInstance<X509TrustManager>()
            .first()

        return object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                defaultTrustManager.checkClientTrusted(chain, authType)
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                try {
                    defaultTrustManager.checkServerTrusted(chain, authType)
                } catch (e: Exception) {
                    val cert = chain?.firstOrNull() ?: throw e
                    val fingerprint = KarnaCertificatePinner.CertificateFingerprint.computeSha256(cert)
                    if (!KarnaCertificatePinner.isFingerprintTrusted(fingerprint)) {
                        throw e
                    }
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> {
                return defaultTrustManager.acceptedIssuers
            }
        }
    }

    private fun createAllTrustManager(): X509TrustManager {
        return object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> {
                return emptyArray()
            }
        }
    }

    private fun isTrustedHostname(hostname: String): Boolean {
        return hostname.endsWith(".karna.dev") ||
                hostname.endsWith(".karna.local") ||
                hostname.matches(Regex("^192\\.168\\.\\d{1,3}\\.\\d{1,3}$")) ||
                hostname.matches(Regex("^10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$")) ||
                hostname == "localhost" ||
                hostname == "127.0.0.1"
    }
}
