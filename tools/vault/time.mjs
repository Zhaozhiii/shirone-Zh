/** Author-facing local dates default to UTC+08:00; normalization never uses build-day time. */
export function normalizeTime(value, label = "时间", referenceDate) {
	if (value === undefined || value === null || value === "") return null;
	let text = String(value).trim();
	if (/^\d{1,2}:\d{1,2}(?::\d{1,2}(?:\.\d+)?)?$/.test(text)) {
		referenceDate =
			typeof referenceDate === "function" ? referenceDate() : referenceDate;
		if (!referenceDate) throw new Error(`${label}只填时间时需要笔记日期`);
		text = `${String(referenceDate).slice(0, 10)} ${text}`;
	}
	const match = text.match(
		/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/i,
	);
	if (!match) throw new Error(`${label}格式无效`);
	const [, y, m, d, h, minute, second, fraction, zone] = match;
	const pad = (value) => String(value).padStart(2, "0");
	const date = `${y}-${pad(m)}-${pad(d)}`;
	const parsed = new Date(`${date}T00:00:00Z`);
	if (
		!Number.isFinite(parsed.valueOf()) ||
		parsed.toISOString().slice(0, 10) !== date
	)
		throw new Error(`${label}日期无效`);
	if (h === undefined) return date;
	if (Number(h) > 23 || Number(minute) > 59 || Number(second || 0) > 59)
		throw new Error(`${label}时间无效`);
	const normalized = `${date}T${pad(h)}:${pad(minute)}:${pad(second || 0)}${fraction || ""}${zone?.toUpperCase() || "+08:00"}`;
	if (!Number.isFinite(Date.parse(normalized)))
		throw new Error(`${label}时区或时间无效`);
	return normalized;
}

export function instant(value, label = "时间", referenceDate) {
	const normalized = normalizeTime(value, label, referenceDate);
	if (!normalized) return null;
	return new Date(
		normalized.includes("T") ? normalized : `${normalized}T00:00:00+08:00`,
	).toISOString();
}

export function shanghaiDate(value) {
	return new Date(new Date(value).valueOf() + 8 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
}

export function displayTime(value) {
	if (!value) return "";
	const normalized = normalizeTime(value);
	if (!normalized.includes("T")) return normalized;
	return new Date(Date.parse(normalized) + 8 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 19)
		.replace("T", " ");
}
