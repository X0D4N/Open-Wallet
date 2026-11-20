package org.openwallet.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

/**
 * The local catalogue: regions, Add-to-Wallet categories, pass templates, providers, card networks,
 * issuers and document types. Loaded from assets/catalog.json (generated from the shared
 * catalogue by scripts/export-catalog.js), so new entries never need code changes.
 *
 * No third-party logo or card artwork is bundled: providers are drawn as text wordmarks in
 * approximate brand colours (not verified against brand guidelines).
 */
data class Region(val code: String, val name: String, val currency: String)
data class Category(
    val id: String, val label: String, val hint: String, val icon: String, val route: String,
    val cat: String?, val template: String?, val templates: List<String>, val group: String?, val doc: String?, val regions: List<String>
)
data class FieldDef(
    val k: String, val label: String, val req: Boolean, val type: String, val upper: Boolean, val max: Int,
    val hint: String, val mask: Boolean, val secret: Boolean, val textarea: Boolean
)
data class Template(val id: String, val label: String, val icon: String, val motif: String, val providerCat: String?, val providerLabel: String, val fields: List<FieldDef>)
data class Provider(
    val id: String, val cat: String, val name: String, val sub: String, val region: String, val color: Long, val fg: Long,
    val city: String?, val iata: String?, val surface: Long?, val ink: Long?, val scene: String?
) {
    /** Name shown on the pass (transit operators are listed by city in directories). */
    val displayName get() = if (cat == "transit") sub else name.replace(" (India)", "")
}
data class Network(val id: String, val name: String, val ranges: List<String>)
data class Product(val id: String, val name: String, val tier: String, val networks: List<String>)
data class Issuer(
    val id: String, val name: String, val country: String, val colors: List<Long>, val fg: Long, val iins: List<String>,
    val aliases: List<String>, val products: List<Product>, val networkLocked: String?
)
data class Official(val label: String, val url: String)
data class DocType(
    val id: String, val region: String, val name: String, val group: String, val authority: String, val numberLabel: String,
    val pattern: String?, val check: String?, val mask: String, val sides: Int, val expiry: Boolean, val sensitivity: String,
    val color: Long, val official: Official?, val fields: List<String>, val sub: String?, val warn: String?
)

class Catalog(json: String) {
    val version: String
    val regions: List<Region>
    val gcc: List<String>
    val categories: List<Category>
    val templates: Map<String, Template>
    val providers: List<Provider>
    val networks: List<Network>
    val issuers: List<Issuer>
    val docs: List<DocType>
    val docFieldLabels: Map<String, String>

    init {
        val o = JSONObject(json)
        version = o.getString("version")
        regions = o.getJSONArray("regions").objs().map { Region(it.getString("code"), it.getString("name"), it.getString("currency")) }
        gcc = o.getJSONArray("gcc").strs()
        categories = o.getJSONArray("categories").objs().map {
            Category(it.getString("id"), it.getString("label"), it.getString("hint"), it.getString("icon"), it.getString("route"),
                it.optStr("cat"), it.optStr("template"), it.optJSONArray("templates")?.strs() ?: emptyList(), it.optStr("group"), it.optStr("doc"),
                it.optJSONArray("regions")?.strs() ?: emptyList())
        }
        templates = o.getJSONArray("templates").objs().associate { t ->
            t.getString("id") to Template(
                t.getString("id"), t.getString("label"), t.getString("icon"), t.getString("motif"), t.optStr("providerCat"), t.getString("providerLabel"),
                t.getJSONArray("fields").objs().map { f ->
                    FieldDef(f.getString("k"), f.getString("label"), f.optBoolean("req"), f.optString("type", "text"), f.optBoolean("upper"),
                        f.optInt("max", 120), f.optString("hint", ""), f.optBoolean("mask"), f.optBoolean("secret"), f.optBoolean("textarea"))
                }
            )
        }
        providers = o.getJSONArray("providers").objs().map {
            Provider(it.getString("id"), it.getString("cat"), it.getString("name"), it.optString("sub", ""), it.getString("region"),
                hex(it.getString("color")), hex(it.optString("fg", "#ffffff")), it.optStr("city"), it.optStr("iata"),
                it.optStr("surface")?.let(::hex), it.optStr("ink")?.let(::hex), it.optStr("scene"))
        }
        networks = o.getJSONArray("networks").objs().map { Network(it.getString("id"), it.getString("name"), it.getJSONArray("ranges").strs()) }
        issuers = o.getJSONArray("issuers").objs().map { b ->
            Issuer(b.getString("id"), b.getString("name"), b.getString("country"), b.getJSONArray("colors").strs().map(::hex), hex(b.optString("fg", "#ffffff")),
                b.optJSONArray("iins")?.strs() ?: emptyList(), b.optJSONArray("aliases")?.strs() ?: emptyList(),
                b.getJSONArray("products").objs().map { p -> Product(p.getString("id"), p.getString("name"), p.optString("tier", "mid"), p.optJSONArray("networks")?.strs() ?: emptyList()) },
                b.optStr("networkLocked"))
        }
        docs = o.getJSONArray("docs").objs().map { d ->
            DocType(d.getString("id"), d.getString("region"), d.getString("name"), d.getString("group"), d.optString("authority", ""), d.optString("numberLabel", "Document number"),
                d.optStr("pattern"), d.optStr("check"), d.optString("mask", "last4"), d.optInt("sides", 2), d.optBoolean("expiry", true), d.optString("sensitivity", "high"),
                hex(d.optString("color", "#3c4a5c")), d.optJSONObject("official")?.let { Official(it.getString("label"), it.getString("url")) },
                d.optJSONArray("fields")?.strs() ?: emptyList(), d.optStr("sub"), d.optStr("warn"))
        }
        val labels = o.getJSONObject("docFieldLabels")
        docFieldLabels = labels.keys().asSequence().associateWith { labels.getString(it) }
    }

    fun regionName(code: String) = regions.firstOrNull { it.code == code }?.name ?: code
    fun template(id: String) = templates[id] ?: templates.getValue("generic")
    fun provider(id: String?) = if (id.isNullOrEmpty()) null else providers.firstOrNull { it.id == id }
    fun issuer(id: String?) = if (id.isNullOrEmpty()) null else issuers.firstOrNull { it.id == id }
    fun network(id: String?) = if (id.isNullOrEmpty()) null else networks.firstOrNull { it.id == id }
    fun docType(id: String?) = docs.firstOrNull { it.id == id }

    private fun inRegion(r: String, region: String?) = region.isNullOrEmpty() || r == region || (region == "GCC" && r in gcc)

    fun providers(cat: String, region: String? = null, q: String = ""): List<Provider> {
        val words = norm(q).split(' ').filter { it.isNotEmpty() }
        return providers.filter { p ->
            p.cat == cat && inRegion(p.region, region) &&
                words.all { w -> norm(listOf(p.name, p.sub, p.city ?: "", p.iata ?: "", regionName(p.region)).joinToString(" ")).contains(w) }
        }
    }

    fun issuersFor(q: String, region: String? = null): List<Issuer> {
        val words = norm(q).split(' ').filter { it.isNotEmpty() }
        return issuers.filter { b ->
            inRegion(b.country, region) && words.all { w -> norm((listOf(b.name, regionName(b.country)) + b.aliases + b.products.map { it.name }).joinToString(" ")).contains(w) }
        }
    }

    fun docsFor(region: String, group: String?): List<DocType> {
        val local = docs.filter { it.region == region && (group == null || it.group == group) }
        val have = local.map { it.id.substringAfter('.') }.toSet()
        return local + docs.filter { it.region == "XX" && (group == null || it.group == group) && it.id.substringAfter('.') !in have }
    }

    companion object {
        @Volatile private var loaded: Catalog? = null
        fun get(context: Context): Catalog = loaded ?: synchronized(this) {
            loaded ?: Catalog(context.assets.open("catalog.json").bufferedReader().use { it.readText() }).also { loaded = it }
        }
        fun norm(s: String): String = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFKD)
            .replace(Regex("\\p{M}+"), "").replace(Regex("[^a-z0-9]+"), " ").trim()
        fun hex(s: String): Long = 0xFF000000 or s.removePrefix("#").toLong(16)
    }
}

private fun JSONArray.objs(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun JSONArray.strs(): List<String> = (0 until length()).map { getString(it) }
private fun JSONObject.optStr(k: String): String? = if (has(k) && !isNull(k)) getString(k).ifEmpty { null } else null
