package org.openwallet.app.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import kotlinx.coroutines.flow.Flow
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** A payment card kept for display only. Never a full number, CVV or PIN: just the last 4 digits. */
@Entity(tableName = "cards")
data class CardEntity(
    @PrimaryKey val id: String,
    val issuerId: String = "",
    val issuerName: String = "",
    val productId: String = "",
    val networkId: String = "",
    val kind: String = "credit",
    val last4: String,
    val holder: String = "",
    val showHolder: Boolean = false,
    val expMonth: Int = 0,
    val expYear: Int = 0,
    val showExpiry: Boolean = false,
    val contactless: Boolean = false,
    val color: Long? = null,
    val nickname: String = "",
    val position: Int = 0,
    val addedAt: Long = System.currentTimeMillis()
)

/** A pass, ticket or booking. `fields` holds the template's fields; the barcode payload is kept verbatim. */
@Entity(tableName = "passes")
data class PassEntity(
    @PrimaryKey val id: String,
    val template: String,
    val providerId: String = "",
    val providerName: String = "",
    val color: Long? = null,
    val art: String = "", // "" = automatic, "none", or an illustration id (flight, train, …)
    val fields: Map<String, String> = emptyMap(),
    val barcodeValue: String = "",
    val barcodeFormat: String = "none",
    val barcodeSource: String = "entered", // entered | import | demo
    val originalFile: String = "",
    val originalMime: String = "",
    val originalName: String = "",
    val originalSha: String = "",
    val source: String = "manual", // manual | import | calendar | sample
    val sourceRef: String = "",
    val sourceStatus: String = "", // "" | changed | removed
    val favorite: Boolean = false,
    val archived: Boolean = false,
    val edited: Boolean = false,
    val currency: String = "USD",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
) {
    fun f(k: String) = fields[k].orEmpty()
}

/** Card or transit activity. Every row is sample or demo data and is labelled as such. */
@Entity(tableName = "activity")
data class ActivityEntity(
    @PrimaryKey val id: String,
    val ownerId: String,
    val merchant: String,
    val amountCents: Long,
    val currency: String = "USD",
    val dateMillis: Long,
    val status: String = "completed",
    val category: String = "",
    val demo: Boolean = true
)

class Converters {
    @TypeConverter fun mapToJson(m: Map<String, String>): String = JSONObject(m).toString()
    @TypeConverter fun jsonToMap(s: String): Map<String, String> = runCatching {
        val o = JSONObject(s); o.keys().asSequence().associateWith { o.getString(it) }
    }.getOrDefault(emptyMap())
}

@Dao
interface WalletDao {
    @Query("SELECT * FROM cards ORDER BY position, addedAt") fun cards(): Flow<List<CardEntity>>
    @Query("SELECT * FROM passes ORDER BY createdAt DESC") fun passes(): Flow<List<PassEntity>>
    @Query("SELECT * FROM activity ORDER BY dateMillis DESC") fun activity(): Flow<List<ActivityEntity>>
    @Query("SELECT * FROM passes") suspend fun allPasses(): List<PassEntity>
    @Query("SELECT COALESCE(MAX(position), -1) FROM cards") suspend fun maxPosition(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertCard(c: CardEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertPass(p: PassEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertActivity(a: ActivityEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertCards(c: List<CardEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertPasses(p: List<PassEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertActivity(a: List<ActivityEntity>)

    @Query("DELETE FROM cards WHERE id = :id") suspend fun deleteCard(id: String)
    @Query("DELETE FROM passes WHERE id = :id") suspend fun deletePass(id: String)
    @Query("DELETE FROM passes WHERE source = 'calendar'") suspend fun deleteCalendarPasses()
    @Query("DELETE FROM activity WHERE id = :id") suspend fun deleteActivity(id: String)
    @Query("DELETE FROM activity WHERE ownerId = :ownerId") suspend fun deleteActivityFor(ownerId: String)
    @Query("DELETE FROM cards") suspend fun clearCards()
    @Query("DELETE FROM passes") suspend fun clearPasses()
    @Query("DELETE FROM activity") suspend fun clearActivity()

    @Transaction
    suspend fun replaceAll(cards: List<CardEntity>, passes: List<PassEntity>, activity: List<ActivityEntity>) {
        clearActivity(); clearCards(); clearPasses()
        insertCards(cards); insertPasses(passes); insertActivity(activity)
    }
}

@Database(entities = [CardEntity::class, PassEntity::class, ActivityEntity::class], version = 2, exportSchema = false)
@TypeConverters(Converters::class)
abstract class WalletDatabase : RoomDatabase() {
    abstract fun dao(): WalletDao

    companion object {
        @Volatile private var instance: WalletDatabase? = null
        private const val NAME = "wallet-encrypted.db"

        /** The whole database is encrypted with SQLCipher; its key is wrapped by Android Keystore. */
        fun get(context: Context): WalletDatabase = instance ?: synchronized(this) {
            instance ?: run {
                System.loadLibrary("sqlcipher")
                val key = Keys.databaseKey(context)
                Room.databaseBuilder(context.applicationContext, WalletDatabase::class.java, NAME)
                    .openHelperFactory(SupportOpenHelperFactory(key))
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .build().also { instance = it }
            }
        }

        /**
         * Version 1.x kept an unencrypted "wallet.db". Its rows are read once, converted to the
         * new format, saved in the encrypted database, and the old file is deleted.
         */
        suspend fun migrateLegacy(context: Context, db: WalletDatabase) {
            val old = context.getDatabasePath("wallet.db")
            if (!old.exists()) return
            val cards = mutableListOf<CardEntity>(); val passes = mutableListOf<PassEntity>(); val acts = mutableListOf<ActivityEntity>()
            runCatching {
                SQLiteDatabase.openDatabase(old.path, null, SQLiteDatabase.OPEN_READONLY).use { s ->
                    s.rawQuery("SELECT id, issuer, nickname, kind, last4, expMonth, expYear, holder, position, addedAt FROM cards", null).use { c ->
                        while (c.moveToNext()) {
                            val issuer = c.getString(1)
                            val match = Catalog.get(context).issuers.firstOrNull { b -> (listOf(b.name) + b.aliases).any { Catalog.norm(it) == Catalog.norm(issuer) } }
                            cards += CardEntity(c.getString(0), issuerId = match?.id ?: "", issuerName = if (match == null) issuer else "", nickname = c.getString(2), kind = c.getString(3),
                                last4 = c.getString(4), expMonth = c.getInt(5), expYear = c.getInt(6), showExpiry = true, holder = c.getString(7), position = c.getInt(8), addedAt = c.getLong(9))
                        }
                    }
                    s.rawQuery("SELECT id, kind, title, subtitle, barcode, showBarcode, fields, balanceCents, dateMillis, archived, createdAt FROM passes", null).use { c ->
                        while (c.moveToNext()) passes += legacyPass(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), c.getInt(5) == 1,
                            c.getString(6), if (c.isNull(7)) null else c.getLong(7), if (c.isNull(8)) null else c.getLong(8), c.getInt(9) == 1, c.getLong(10))
                    }
                    s.rawQuery("SELECT id, ownerId, merchant, amountCents, dateMillis, status, category, demo FROM activity", null).use { c ->
                        while (c.moveToNext()) acts += ActivityEntity(c.getString(0), c.getString(1), c.getString(2), c.getLong(3), "USD", c.getLong(4), c.getString(5), c.getString(6), c.getInt(7) == 1)
                    }
                }
                db.dao().insertCards(cards); db.dao().insertPasses(passes); db.dao().insertActivity(acts)
            }
            context.deleteDatabase("wallet.db")
        }

        private fun legacyPass(id: String, kind: String, title: String, subtitle: String, barcode: String, show: Boolean, fieldsJson: String,
                               balanceCents: Long?, dateMillis: Long?, archived: Boolean, createdAt: Long): PassEntity {
            val old = runCatching { val a = JSONArray(fieldsJson); (0 until a.length()).associate { val p = a.getJSONArray(it); p.getString(0) to p.getString(1) } }.getOrDefault(emptyMap())
            val f = mutableMapOf<String, String>()
            val (template, map) = when (kind) {
                "boarding" -> "flight" to mapOf("From" to "from", "To" to "to", "Flight" to "flightNo", "Gate" to "gate", "Seat" to "seat", "Passenger" to "passenger", "Boarding" to "boarding", "Group" to "zone")
                "event" -> "event" to mapOf("Venue" to "venue", "Section" to "section", "Seat" to "seat")
                "loyalty" -> "loyalty" to mapOf("Member" to "member", "Points" to "points", "Tier" to "tier")
                "gift" -> "gift" to mapOf("Card number" to "number")
                "transit" -> "transit" to mapOf("Fare" to "fare", "Card number" to "number")
                else -> "generic" to emptyMap()
            }
            old.forEach { (k, v) -> map[k]?.let { f[it] = v } }
            if (template == "event" || template == "generic") f["title"] = title
            if (template == "generic" && subtitle.isNotBlank()) f["subtitle"] = subtitle
            if (template == "transit") f["passType"] = "Stored value"
            balanceCents?.let { f["balance"] = "%.2f".format(it / 100.0) }
            dateMillis?.let {
                val t = java.time.LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(it), java.time.ZoneId.systemDefault())
                f["date"] = t.toLocalDate().toString(); f["time"] = "%02d:%02d".format(t.hour, t.minute)
            }
            return PassEntity(id, template, providerName = if (template in setOf("flight", "loyalty", "gift", "transit")) title else "", fields = f,
                barcodeValue = barcode, barcodeFormat = if (show && barcode.isNotBlank()) "code128" else "none", archived = archived, createdAt = createdAt, updatedAt = createdAt)
        }
    }
}

/** Removes a file's bytes before deleting it (best effort; flash storage may keep copies, which are encrypted anyway). */
fun File.wipe() { runCatching { if (exists()) { writeBytes(ByteArray(length().toInt())) } }; delete() }
