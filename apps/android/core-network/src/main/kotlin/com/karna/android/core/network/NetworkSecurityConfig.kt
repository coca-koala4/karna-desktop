package com.karna.android.core.network

object NetworkSecurityConfig {
    const val CLEARTEXT_TRAFFIC_DISABLED = true
    const val TRUSTED_CERTIFICATES_ONLY = true
    const val MIN_TLS_VERSION = "TLSv1.3"

    val PERMITTED_DOMAINS = listOf(
        "*.karna.dev",
        "*.karna.local",
        "192.168.0.0/16",
        "10.0.0.0/8",
        "127.0.0.1",
        "localhost"
    )

    val CLEARTEXT_DOMAINS = emptyList<String>()

    val PINNED_DOMAINS = mapOf(
        "api.karna.dev" to listOf(
            "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
        ),
        "relay.karna.dev" to listOf(
            "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
            "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="
        )
    )
}
