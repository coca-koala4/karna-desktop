package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.FileDescriptorEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface FileDao {
    @Query("SELECT * FROM files ORDER BY updatedAtTimestamp DESC")
    fun getAllFiles(): Flow<List<FileDescriptorEntity>>

    @Query("SELECT * FROM files WHERE projectId = :projectId ORDER BY updatedAtTimestamp DESC")
    fun getFilesByProject(projectId: String): Flow<List<FileDescriptorEntity>>

    @Query("SELECT * FROM files WHERE mimeType LIKE :mimeTypePattern ORDER BY updatedAtTimestamp DESC")
    fun getFilesByMimeType(mimeTypePattern: String): Flow<List<FileDescriptorEntity>>

    @Query("SELECT * FROM files WHERE id = :id")
    suspend fun getFileById(id: String): FileDescriptorEntity?

    @Query("SELECT * FROM files WHERE path = :path")
    suspend fun getFileByPath(path: String): FileDescriptorEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFile(file: FileDescriptorEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFiles(files: List<FileDescriptorEntity>)

    @Update
    suspend fun updateFile(file: FileDescriptorEntity)

    @Delete
    suspend fun deleteFile(file: FileDescriptorEntity)

    @Query("DELETE FROM files WHERE id = :id")
    suspend fun deleteFileById(id: String)

    @Query("UPDATE files SET isUploaded = :uploaded, remoteUrl = :url WHERE id = :id")
    suspend fun updateUploadStatus(id: String, uploaded: Boolean, url: String?)
}
