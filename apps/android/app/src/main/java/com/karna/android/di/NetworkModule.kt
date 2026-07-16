package com.karna.android.di

import com.karna.android.core.network.KarnaHttpClient
import com.karna.android.core.network.KarnaWebSocket
import com.karna.android.core.network.RemoteApiService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return KarnaHttpClient.create()
    }

    @Provides
    @Singleton
    @Named("lan")
    fun provideLanOkHttpClient(): OkHttpClient {
        return KarnaHttpClient.createForLan()
    }

    @Provides
    @Singleton
    fun provideRemoteApiService(client: OkHttpClient): RemoteApiService {
        return RemoteApiService(client)
    }

    @Provides
    @Singleton
    fun provideKarnaWebSocket(client: OkHttpClient): KarnaWebSocket {
        return KarnaWebSocket(client)
    }
}
