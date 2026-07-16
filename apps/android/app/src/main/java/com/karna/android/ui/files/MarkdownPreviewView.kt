package com.karna.android.ui.files

import android.widget.TextView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.widget.TextViewCompat
import com.karna.android.core.preview.MarkdownPreviewHandler

@Composable
fun MarkdownPreviewView(
    markdown: String,
    modifier: Modifier = Modifier,
    markdownHandler: MarkdownPreviewHandler? = null
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            TextView(context).apply {
                setTextIsSelectable(true)
                TextViewCompat.setTextAppearance(this, android.R.style.TextAppearance_Material_Body1)
                setPadding(0, 0, 0, 0)
            }
        },
        update = { textView ->
            if (markdownHandler != null) {
                markdownHandler.render(markdown, textView)
            } else {
                textView.text = markdown
            }
        }
    )
}
