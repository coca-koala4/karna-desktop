package com.karna.android.di

import android.content.Context
import com.karna.android.core.crypto.CryptoOperations
import com.karna.android.core.crypto.KeyStoreManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object CryptoModule {

    @Provides
    @Singleton
    fun provideKeyStoreManager(
        @ApplicationContext context: Context
    ): KeyStoreManager {
        return KeyStoreManager(context)
    }

    @Provides
    @Singleton
    fun provideCryptoOperations(): CryptoOperations {
        return CryptoOperations
    }
}
