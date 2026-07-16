package com.karna.android.core.network

import android.util.LruCache
import okhttp3.CertificatePinner
import java.security.cert.X509Certificate
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

object KarnaCertificatePinner {

    private val KARNA_DOMAIN_PINS = mapOf(
        "api.karna.dev" to listOf(
            "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
        ),
        "relay.karna.dev" to listOf(
            "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
            "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="
        )
    )

    private val dynamicPins = ConcurrentHashMap<String, List<String>>()
    private val trustedFingerprints = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
    private val trustManagerCache = LruCache<String, X509TrustManager>(10)

    fun create(): CertificatePinner {
        return create(dynamicPins)
    }

    fun createForLan(): CertificatePinner {
        return CertificatePinner.Builder().build()
    }

    fun create(additionalPins: Map<String, List<String>>): CertificatePinner {
        val builder = CertificatePinner.Builder()
        KARNA_DOMAIN_PINS.forEach { (domain, pins) ->
            pins.forEach { pin ->
                builder.add(domain, pin)
            }
        }
        additionalPins.forEach { (domain, pins) ->
            pins.forEach { pin ->
                builder.add(domain, pin)
            }
        }
        return builder.build()
    }

    fun addTrustedFingerprint(fingerprint: String) {
        trustedFingerprints.add(fingerprint)
    }

    fun removeTrustedFingerprint(fingerprint: String) {
        trustedFingerprints.remove(fingerprint)
    }

    fun clearTrustedFingerprints() {
        trustedFingerprints.clear()
    }

    fun addPin(hostname: String, pin: String) {
        val current = dynamicPins[hostname] ?: emptyList()
        dynamicPins[hostname] = current + pin
    }

    fun removePin(hostname: String) {
        dynamicPins.remove(hostname)
    }

    fun getTrustManagerForFingerprint(fingerprint: String): X509TrustManager? {
        return trustManagerCache.get(fingerprint)
    }

    fun isFingerprintTrusted(fingerprint: String): Boolean {
        return trustedFingerprints.contains(fingerprint)
    }

    fun buildPinnedTrustManager(certificate: X509Certificate): X509TrustManager {
        val key = certificate.subjectX500Principal.name
        var manager = trustManagerCache.get(key)
        if (manager != null) return manager

        val trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        trustManagerFactory.init(null as java.security.KeyStore?)
        val defaultManagers = trustManagerFactory.trustManagers

        manager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                throw UnsupportedOperationException("Client auth not supported")
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                chain?.firstOrNull()?.let { cert ->
                    val certFingerprint = CertificateFingerprint.computeSha256(cert)
                    if (!trustedFingerprints.contains(certFingerprint)) {
                        throw SecurityException("Certificate fingerprint not trusted: $certFingerprint")
                    }
                } ?: throw SecurityException("No server certificate provided")
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> {
                return defaultManagers
                    .filterIsInstance<X509TrustManager>()
                    .flatMap { it.acceptedIssuers.toList() }
                    .toTypedArray()
            }
        }

        trustManagerCache.put(key, manager)
        return manager
    }

    object CertificateFingerprint {
        fun computeSha256(cert: X509Certificate): String {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            val der = cert.encoded
            val hash = md.digest(der)
            return "sha256/" + android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)
        }
    }
}
