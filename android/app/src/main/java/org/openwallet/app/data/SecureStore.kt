package org.openwallet.app.data

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android Keystore-backed AES-256-GCM keys. The keys never leave the device's secure hardware
 * (where available) and are not included in backups.
 */
object Keys {
    private const val STORE = "AndroidKeyStore"

    private fun key(alias: String): SecretKey {
        val ks = KeyStore.getInstance(STORE).apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE)
        gen.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return gen.generateKey()
    }

    fun encrypt(alias: String, data: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key(alias)) }
        val body = c.doFinal(data)
        return byteArrayOf(1) + c.iv + body
    }

    fun decrypt(alias: String, blob: ByteArray): ByteArray {
        require(blob.isNotEmpty() && blob[0].toInt() == 1) { "Unknown format" }
        val iv = blob.copyOfRange(1, 13)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(alias), GCMParameterSpec(128, iv)) }
        return c.doFinal(blob.copyOfRange(13, blob.size))
    }

    fun delete(alias: String) = runCatching { KeyStore.getInstance(STORE).apply { load(null) }.deleteEntry(alias) }

    /** 32 random bytes for SQLCipher, stored wrapped by the Keystore key "db". */
    fun databaseKey(context: Context): ByteArray {
        val f = File(context.noBackupFilesDir, "db.key")
        if (f.exists()) return decrypt("db", f.readBytes())
        val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }
        f.writeBytes(encrypt("db", raw))
        return raw
    }

    fun sha256(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    fun newId(prefix: String) = prefix + "_" + java.lang.Long.toString(System.currentTimeMillis(), 36) + java.lang.Long.toString(SecureRandom().nextLong() and 0xFFFFFF, 36)
}

data class StoredFile(val fileId: String, val name: String, val mime: String, val size: Long, val sha256: String)

/** Encrypted file store (imported originals of passes, or vault documents). Files are kept byte-for-byte. */
class FileStore(private val context: Context, private val dir: File, private val alias: String) {
    init { dir.mkdirs() }

    fun add(uri: Uri, name: String): Result<StoredFile> = runCatching {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Couldn't read that file")
        addBytes(bytes, name)
    }

    fun addBytes(bytes: ByteArray, name: String): StoredFile {
        require(bytes.size <= 25 * 1024 * 1024) { "Files can be up to 25 MB" }
        val mime = sniff(bytes) ?: error("Use a PNG, JPEG, WebP or GIF image, or a PDF")
        val id = Keys.newId("f")
        File(dir, "$id.bin").writeBytes(Keys.encrypt(alias, bytes))
        return StoredFile(id, name.take(120), mime, bytes.size.toLong(), Keys.sha256(bytes))
    }

    fun read(id: String): ByteArray = Keys.decrypt(alias, File(dir, "${safe(id)}.bin").readBytes())
    fun remove(id: String) { File(dir, "${safe(id)}.bin").wipe() }
    fun clear() { dir.listFiles()?.forEach { it.wipe() } }

    /** Decrypted copy in the app's private cache, for opening a PDF in another app; deleted on lock or exit. */
    fun tempCopy(id: String, name: String): File {
        val d = File(context.cacheDir, "share").apply { mkdirs() }
        return File(d, name.replace(Regex("[^\\w.-]+"), "_")).apply { writeBytes(read(id)) }
    }

    private fun safe(id: String): String { require(Regex("^[A-Za-z0-9_]+$").matches(id)); return id }

    companion object {
        fun sniff(b: ByteArray): String? {
            fun at(vararg sig: Int) = b.size >= sig.size && sig.indices.all { (b[it].toInt() and 0xFF) == sig[it] }
            return when {
                at(0x89, 0x50, 0x4E, 0x47) -> "image/png"
                at(0xFF, 0xD8, 0xFF) -> "image/jpeg"
                at(0x47, 0x49, 0x46, 0x38) -> "image/gif"
                at(0x25, 0x50, 0x44, 0x46) -> "application/pdf"
                at(0x52, 0x49, 0x46, 0x46) && b.size > 12 && String(b, 8, 4) == "WEBP" -> "image/webp"
                else -> null
            }
        }
        fun clearTemp(context: Context) { File(context.cacheDir, "share").listFiles()?.forEach { it.wipe() } }
    }
}

/** A personal copy of an identity, health or vehicle document. Never an official or verified credential. */
data class DocRecord(
    val id: String, val typeId: String, val region: String, val label: String = "", val holder: String = "", val number: String = "",
    val expiry: String = "", val authority: String = "", val fields: Map<String, String> = emptyMap(), val files: List<Pair<String, StoredFile>> = emptyList(),
    val favorite: Boolean = false, val createdAt: Long = System.currentTimeMillis(), val updatedAt: Long = System.currentTimeMillis()
)

/** The document vault: records in one encrypted file, files encrypted one by one, all under the Keystore key "vault". */
class Vault(private val context: Context) {
    private val dir = File(context.noBackupFilesDir, "vault").apply { mkdirs() }
    private val recordsFile = File(dir, "docs.bin")
    val files = FileStore(context, File(dir, "files"), "vault")

    fun load(): List<DocRecord> {
        if (!recordsFile.exists()) return emptyList()
        val a = JSONArray(String(Keys.decrypt("vault", recordsFile.readBytes())))
        return (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            val f = o.optJSONObject("fields") ?: JSONObject()
            val fa = o.optJSONArray("files") ?: JSONArray()
            DocRecord(o.getString("id"), o.getString("typeId"), o.optString("region"), o.optString("label"), o.optString("holder"), o.optString("number"),
                o.optString("expiry"), o.optString("authority"), f.keys().asSequence().associateWith { f.getString(it) },
                (0 until fa.length()).map { j -> val x = fa.getJSONObject(j); x.getString("side") to StoredFile(x.getString("fileId"), x.optString("name"), x.optString("mime"), x.optLong("size"), x.optString("sha256")) },
                o.optBoolean("favorite"), o.optLong("createdAt"), o.optLong("updatedAt"))
        }
    }

    fun save(docs: List<DocRecord>) {
        val a = JSONArray()
        docs.forEach { d ->
            a.put(JSONObject().put("id", d.id).put("typeId", d.typeId).put("region", d.region).put("label", d.label).put("holder", d.holder).put("number", d.number)
                .put("expiry", d.expiry).put("authority", d.authority).put("fields", JSONObject(d.fields)).put("favorite", d.favorite).put("createdAt", d.createdAt).put("updatedAt", d.updatedAt)
                .put("files", JSONArray().apply { d.files.forEach { (side, f) -> put(JSONObject().put("side", side).put("fileId", f.fileId).put("name", f.name).put("mime", f.mime).put("size", f.size).put("sha256", f.sha256)) } }))
        }
        val tmp = File(dir, "docs.tmp")
        tmp.writeBytes(Keys.encrypt("vault", a.toString().toByteArray()))
        tmp.renameTo(recordsFile)
    }

    fun reset() { files.clear(); recordsFile.wipe() }
}
