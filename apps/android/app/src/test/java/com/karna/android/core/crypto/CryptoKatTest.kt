package com.karna.android.core.crypto

import org.junit.Test
import org.junit.Assert.*

class CryptoKatTest {

    @Test
    fun aesGcm_basicEncryptionDecryption() {
    }

    @Test
    fun hmacSigner_signAndVerify() {
    }

    @Test
    fun keyDerivation_pbkdf2KnownAnswer() {
    }

    @Test
    fun hashUtils_sha256KnownAnswer() {
        val input = "test".toByteArray()
        val expectedHash = "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg="
    }
}
