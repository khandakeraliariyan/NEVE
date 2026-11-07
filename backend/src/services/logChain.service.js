import { hashChainEvent } from "./hashChain.service.js";

// Mongoose plugin that makes an append-only log tamper-evident. Every new
// entry gets the next chainSeq, the previous entry's hash, and a SHA-256 of
// its own content. A unique index on chainSeq stops two writers from both
// taking the same position; the losing write is retried by
// createChainedLogEntry.

export function logChainPlugin(schema, { fields }) {
    schema.add({
        chainSeq: { type: Number, default: null },
        prevHash: { type: String, default: null },
        hash: { type: String, default: null },
    });
    schema.index(
        { chainSeq: 1 },
        { unique: true, partialFilterExpression: { chainSeq: { $type: "number" } } }
    );
    schema.statics.chainFieldsOf = fields;

    schema.pre("save", async function chainEntry() {
        if (!this.isNew || this.chainSeq != null) return;
        const now = new Date();
        if (!this.createdAt) this.createdAt = now;
        if (!this.updatedAt) this.updatedAt = this.createdAt;
        const last = await this.constructor
            .findOne({ chainSeq: { $type: "number" } })
            .sort({ chainSeq: -1 })
            .select("chainSeq hash")
            .lean();
        this.chainSeq = (last?.chainSeq ?? 0) + 1;
        this.prevHash = last?.hash ?? null;
        this.hash = hashChainEvent(fields(this), this.prevHash);
    });

    // Chained entries are append-only.
    for (const hook of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"]) {
        schema.pre(hook, function blockChainedUpdates() {
            throw new Error("Chained log entries can't be modified.");
        });
    }
}

const DUPLICATE_KEY = 11000;

export async function createChainedLogEntry(Model, data, attempts = 5) {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await Model.create(data);
        } catch (error) {
            const chainConflict = error?.code === DUPLICATE_KEY && /chainSeq/.test(String(error.message));
            if (!chainConflict || attempt >= attempts) throw error;
        }
    }
}

// Streams the whole chain in order and verifies it.
export async function verifyLogChain(Model, { limit = 100000 } = {}) {
    const cursor = Model.find({ chainSeq: { $type: "number" } })
        .sort({ chainSeq: 1 })
        .limit(limit)
        .lean()
        .cursor();

    let expectedSeq = null;
    let previousHash = null;
    let checked = 0;
    for await (const entry of cursor) {
        if (expectedSeq === null) {
            expectedSeq = entry.chainSeq;
            if (entry.chainSeq !== 1 || entry.prevHash !== null) {
                return { valid: false, checked, brokenAtSeq: entry.chainSeq, reason: "The chain doesn't start at its first entry." };
            }
        }
        if (entry.chainSeq !== expectedSeq) {
            return { valid: false, checked, brokenAtSeq: expectedSeq, reason: "An entry is missing from the chain." };
        }
        if (entry.prevHash !== previousHash) {
            return { valid: false, checked, brokenAtSeq: entry.chainSeq, reason: "An entry doesn't point to the entry before it." };
        }
        if (hashChainEvent(Model.chainFieldsOf(entry), entry.prevHash) !== entry.hash) {
            return { valid: false, checked, brokenAtSeq: entry.chainSeq, reason: "An entry's content doesn't match its hash." };
        }
        previousHash = entry.hash;
        expectedSeq += 1;
        checked += 1;
    }
    return { valid: true, checked, brokenAtSeq: null, headHash: previousHash };
}
