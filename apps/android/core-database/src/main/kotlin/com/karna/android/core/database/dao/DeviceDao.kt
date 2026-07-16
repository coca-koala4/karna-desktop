package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.DesktopDeviceEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DeviceDao {
    @Query("SELECT * FROM devices ORDER BY lastSeen DESC")
    fun getAllDevices(): Flow<List<DesktopDeviceEntity>>

    @Query("SELECT * FROM devices WHERE isPaired = 1 ORDER BY lastSeen DESC")
    fun getPairedDevices(): Flow<List<DesktopDeviceEntity>>

    @Query("SELECT * FROM devices WHERE id = :id")
    suspend fun getDeviceById(id: String): DesktopDeviceEntity?

    @Query("SELECT * FROM devices WHERE host = :host AND port = :port")
    suspend fun getDeviceByHostPort(host: String, port: Int): DesktopDeviceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDevice(device: DesktopDeviceEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDevices(devices: List<DesktopDeviceEntity>)

    @Update
    suspend fun updateDevice(device: DesktopDeviceEntity)

    @Delete
    suspend fun deleteDevice(device: DesktopDeviceEntity)

    @Query("DELETE FROM devices WHERE id = :id")
    suspend fun deleteDeviceById(id: String)

    @Query("UPDATE devices SET lastSeen = :timestamp WHERE id = :id")
    suspend fun updateLastSeen(id: String, timestamp: Long)

    @Query("UPDATE devices SET isPaired = :isPaired, pairingToken = :token WHERE id = :id")
    suspend fun updatePairingStatus(id: String, isPaired: Boolean, token: String?)
}
