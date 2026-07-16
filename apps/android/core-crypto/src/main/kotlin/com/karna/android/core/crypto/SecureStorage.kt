package com.karna.android.core.crypto

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.secureDataStore: DataStore<Preferences> by preferencesDataStore(name = "karna_secure")

/**
 * 安全存储类
 *
 * 使用Android Keystore保护的密钥对SharedPreferences/DataStore数据进行加密存储
 */
class SecureStorage(
    private val context: Context
) {

    private val keyStoreManager = KeyStoreManager(context)
    private val dataStore: DataStore<Preferences> = context.secureDataStore

    private val storageKey: ByteArray by lazy {
        getOrCreateStorageKey()
    }

    /**
     * 加密存储字符串
     *
     * @param key 存储键
     * @param value 明文值
     */
    suspend fun putString(key: String, value: String) {
        val encrypted = AesGcmCipher.encryptString(value, storageKey)
        dataStore.edit { prefs ->
            prefs[stringPreferencesKey(key)] = encrypted
        }
    }

    /**
     * 获取解密后的字符串
     *
     * @param key 存储键
     * @param defaultValue 默认值
     * @return 明文字符串
     */
    suspend fun getString(key: String, defaultValue: String? = null): String? {
        val prefKey = stringPreferencesKey(key)
        return dataStore.data.map { prefs ->
            val encrypted = prefs[prefKey] ?: return@map defaultValue
            try {
                AesGcmCipher.decryptString(encrypted, storageKey)
            } catch (e: Exception) {
                defaultValue
            }
        }.first()
    }

    /**
     * 删除存储项
     *
     * @param key 存储键
     */
    suspend fun remove(key: String) {
        dataStore.edit { prefs ->
            prefs.remove(stringPreferencesKey(key))
        }
    }

    /**
     * 清空所有存储
     */
    suspend fun clear() {
        dataStore.edit { prefs ->
            prefs.clear()
        }
    }

    /**
     * 使用SharedPreferences同步存储（用于非协程环境）
     */
    inner class SyncSecureStorage {

        private val prefs: SharedPreferences = context.getSharedPreferences(
            "karna_secure_sync",
            Context.MODE_PRIVATE
        )

        /**
         * 同步存储字符串
         */
        fun putString(key: String, value: String) {
            val encrypted = AesGcmCipher.encryptString(value, storageKey)
            prefs.edit().putString(key, encrypted).apply()
        }

        /**
         * 同步获取字符串
         */
        fun getString(key: String, defaultValue: String? = null): String? {
            val encrypted = prefs.getString(key, null) ?: return defaultValue
            return try {
                AesGcmCipher.decryptString(encrypted, storageKey)
            } catch (e: Exception) {
                defaultValue
            }
        }

        /**
         * 删除指定键
         */
        fun remove(key: String) {
            prefs.edit().remove(key).apply()
        }

        /**
         * 清空所有
         */
        fun clear() {
            prefs.edit().clear().apply()
        }
    }

    /**
     * 获取同步存储实例
     */
    fun sync(): SyncSecureStorage = SyncSecureStorage()

    /**
     * 获取或创建存储加密密钥
     */
    private fun getOrCreateStorageKey(): ByteArray {
        val keyAlias = "karna_storage_key"
        return if (KeyGenerator.keyExists(keyAlias)) {
            val keyPair = KeyGenerator.getKeyPair(keyAlias)
                ?: KeyGenerator.generateKeyPair(keyAlias)
            deriveStorageKeyFromKeypair(keyPair)
        } else {
            val keyPair = KeyGenerator.generateKeyPair(keyAlias)
            deriveStorageKeyFromKeypair(keyPair)
        }
    }

    /**
     * 从密钥对派生存储密钥
     */
    private fun deriveStorageKeyFromKeypair(keyPair: java.security.KeyPair): ByteArray {
        val publicKeyBytes = keyPair.public.encoded
        val privateKey = keyPair.private
        val material = HashUtils.sha256(publicKeyBytes + "karna_storage_v1".toByteArray())
        return KeyDerivation.deriveKey(
            ikm = material,
            salt = "karna_salt".toByteArray(),
            info = "secure_storage_key".toByteArray(),
            outputLength = 32
        )
    }
}
