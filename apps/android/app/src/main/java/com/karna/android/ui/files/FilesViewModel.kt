package com.karna.android.ui.files

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.database.entity.FileDescriptorEntity
import com.karna.android.core.model.FilePreview
import com.karna.android.data.repository.FileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

data class FilesUiState(
    val files: List<FileDescriptorEntity> = emptyList(),
    val fileTree: List<FileTreeNode> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

data class FilePreviewUiState(
    val file: FileDescriptorEntity? = null,
    val localFile: File? = null,
    val previewContent: FilePreview? = null,
    val markdownContent: String? = null,
    val pdfPageCount: Int? = null,
    val currentPdfPage: Int = 0,
    val isDownloading: Boolean = false,
    val downloadProgress: Float = 0f,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

@HiltViewModel
class FilesViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val context: Context,
    private val fileRepository: FileRepository
) : ViewModel() {

    private val fileId: String? = savedStateHandle["fileId"]
    private val _isLoading = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _isDownloading = MutableStateFlow(false)
    private val _downloadProgress = MutableStateFlow(0f)
    private val _localFile = MutableStateFlow<File?>(null)
    private val _previewContent = MutableStateFlow<FilePreview?>(null)
    private val _markdownContent = MutableStateFlow<String?>(null)
    private val _pdfPageCount = MutableStateFlow<Int?>(null)
    private val _currentPdfPage = MutableStateFlow(0)

    val filesUiState: StateFlow<FilesUiState>

    val filePreviewUiState: StateFlow<FilePreviewUiState>

    init {
        filesUiState = combine(
            fileRepository.observeAllFiles(),
            _isLoading,
            _errorMessage
        ) { files, loading, error ->
            FilesUiState(
                files = files,
                fileTree = buildFileTree(files),
                isLoading = loading,
                errorMessage = error
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = FilesUiState(isLoading = true)
        )

        val fileFlow = kotlinx.coroutines.flow.flow {
            if (fileId != null) {
                val file = fileRepository.getFileById(fileId)
                emit(file)
            } else {
                emit(null)
            }
        }

        val filePreviewFlow1 = combine(
            fileFlow,
            _localFile,
            _previewContent,
            _markdownContent,
            _pdfPageCount
        ) { file, local, preview, markdown, pdfPages ->
            object {
                val file = file
                val local = local
                val preview = preview
                val markdown = markdown
                val pdfPages = pdfPages
            }
        }

        val filePreviewFlow2 = combine(
            _currentPdfPage,
            _isDownloading,
            _downloadProgress,
            _isLoading,
            _errorMessage
        ) { currentPage, downloading, progress, loading, error ->
            object {
                val currentPage = currentPage
                val downloading = downloading
                val progress = progress
                val loading = loading
                val error = error
            }
        }

        filePreviewUiState = combine(
            filePreviewFlow1,
            filePreviewFlow2
        ) { f1, f2 ->
            FilePreviewUiState(
                file = f1.file,
                localFile = f1.local,
                previewContent = f1.preview,
                markdownContent = f1.markdown,
                pdfPageCount = f1.pdfPages,
                currentPdfPage = f2.currentPage,
                isDownloading = f2.downloading,
                downloadProgress = f2.progress,
                isLoading = f2.loading,
                errorMessage = f2.error
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = FilePreviewUiState(isLoading = true)
        )

        loadFiles()
    }

    fun loadFiles() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            fileRepository.refreshFiles().onFailure { e ->
                _errorMessage.value = e.message ?: "加载文件失败"
            }
            _isLoading.value = false
        }
    }

    fun downloadAndPreviewFile(fileId: String) {
        viewModelScope.launch {
            _isDownloading.value = true
            _errorMessage.value = null
            _downloadProgress.value = 0f

            val downloadsDir = File(context.filesDir, "downloads").apply { mkdirs() }

            fileRepository.downloadFile(fileId, downloadsDir).onSuccess { file ->
                _localFile.value = file
                loadFilePreview(file, fileId)
            }.onFailure { e ->
                _errorMessage.value = e.message ?: "下载失败"
            }

            _isDownloading.value = false
        }
    }

    private suspend fun loadFilePreview(localFile: File, fileId: String) {
        withContext(Dispatchers.IO) {
            val name = localFile.name.lowercase()
            when {
                name.endsWith(".md") || name.endsWith(".txt") -> {
                    _markdownContent.value = localFile.readText()
                }
                name.endsWith(".pdf") -> {
                    try {
                        android.graphics.pdf.PdfRenderer(
                            android.os.ParcelFileDescriptor.open(localFile, android.os.ParcelFileDescriptor.MODE_READ_ONLY)
                        ).use { renderer ->
                            _pdfPageCount.value = renderer.pageCount
                        }
                    } catch (e: Exception) {
                        _errorMessage.value = e.message ?: "无法打开PDF"
                    }
                }
                else -> {
                    fileRepository.getFilePreview(fileId).onSuccess { preview ->
                        _previewContent.value = preview
                    }.onFailure { e ->
                        _errorMessage.value = e.message ?: "加载预览失败"
                    }
                }
            }
        }
    }

    fun goToPage(page: Int) {
        _currentPdfPage.value = page.coerceIn(0, (_pdfPageCount.value ?: 1) - 1)
    }

    fun nextPage() {
        val maxPage = (_pdfPageCount.value ?: 1) - 1
        _currentPdfPage.value = (_currentPdfPage.value + 1).coerceAtMost(maxPage)
    }

    fun previousPage() {
        _currentPdfPage.value = (_currentPdfPage.value - 1).coerceAtLeast(0)
    }

    fun clearError() {
        _errorMessage.value = null
    }

}
