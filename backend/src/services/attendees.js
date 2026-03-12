const Employee = require("../models/employee");
const Cluster = require("../models/groups");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeLabel = (value = "") =>
    String(value || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\b(team|group|dept|department)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const resolveAttendees = async (attendeeRefs) => {
    if (!attendeeRefs || !Array.isArray(attendeeRefs) || attendeeRefs.length === 0) {
        throw new Error("No attendees specified");
    }

    const [allEmployees, allGroups] = await Promise.all([
        Employee.find().select("email name department").lean(),
        Cluster.find().select("name").lean(),
    ]);

    const resolved = new Set();

    const addEmails = (emails) => {
        emails.forEach((e) => {
            if (e && typeof e === "string") {
                resolved.add(e.toLowerCase().trim());
            }
        });
    };

    const findGroupMembers = (search) => {
        const s = normalizeLabel(search);
        if (!s) return null;
        const searchTokens = s.split(/\s+/).filter((w) => w.length > 1);

        const group = allGroups.find((g) => {
            const gn = normalizeLabel(g.name);
            return gn === s || s.includes(gn) || gn.includes(s) ||
                searchTokens.some((w) => gn.includes(w));
        });
        const groupSearchBase = group ? normalizeLabel(group.name) : s;

        const deptMatches = allEmployees
            .filter((e) => {
                const dept = normalizeLabel(e.department || "");
                return dept && (
                    dept === groupSearchBase ||
                    dept.includes(groupSearchBase) ||
                    groupSearchBase.includes(dept) ||
                    searchTokens.some((w) => w.length > 2 && dept.includes(w))
                );
            })
            .map((e) => e.email);

        if (deptMatches.length) return deptMatches;
        return null;
    };

    for (const ref of attendeeRefs) {
        const input = typeof ref === "string" ? ref.trim() : (ref.email || ref.name || "").trim();
        if (!input) continue;

        // 1. Direct Email Match
        if (EMAIL_REGEX.test(input)) {
            addEmails([input]);
            continue;
        }

        // 2. Group/Department Match
        const groupEmails = findGroupMembers(input);
        if (groupEmails?.length) {
            addEmails(groupEmails);
            continue;
        }

        // 3. Employee Name/Email Fuzzy Match
        const normalized = input.toLowerCase().replace(/\s+/g, "");
        const employee = allEmployees.find((emp) => {
            const n = emp.name.toLowerCase().replace(/\s+/g, "");
            const e = emp.email.toLowerCase().replace(/\s+/g, "");
            return n.includes(normalized) || normalized.includes(n) || e.includes(normalized);
        });

        if (employee) {
            addEmails([employee.email]);
        } else {
            // If it's an object with an email (likely external or already validated), trust it
            if (typeof ref === "object" && ref.email && EMAIL_REGEX.test(ref.email)) {
                addEmails([ref.email]);
            } else {
                throw new Error(`"${input}" not found. Use a person name, email, or group name.`);
            }
        }
    }

    return Array.from(resolved);
};

module.exports = {
    resolveAttendees,
    normalizeLabel,
    EMAIL_REGEX,
};
