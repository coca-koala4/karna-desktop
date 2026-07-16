package com.karna.android.core.preview

import android.content.Context
import android.widget.TextView
import dagger.hilt.android.qualifiers.ApplicationContext
import io.noties.markwon.Markwon
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.linkify.LinkifyPlugin
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MarkdownPreviewHandler @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val markwon: Markwon by lazy {
        Markwon.builder(context)
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(TablePlugin.create(context))
            .usePlugin(LinkifyPlugin.create())
            .build()
    }

    fun render(markdown: String, textView: TextView) {
        markwon.setMarkdown(textView, markdown)
    }

    fun parse(markdown: String): CharSequence {
        return markwon.toMarkdown(markdown)
    }

    fun renderToSpanned(markdown: String): android.text.Spanned {
        return markwon.toMarkdown(markdown)
    }
}
