// Package hash implements RFC-8785 canonical JSON serialization and SHA-256
// hashing for OPG-L 0.6 primitives and bundles.
//
// The canonical preimage rules (§15.5–§15.7 of OPG-L 0.6) require:
//   - Object keys sorted lexicographically by UTF-16 code units
//   - No insignificant whitespace
//   - JSON-spec-conformant string escapes (lowercase hex in \uXXXX)
//   - Numbers serialized per ECMA-262 / RFC 8785 §3.2.2
//   - Transient fields excluded before hashing: {modified, content_hash, current_git_ref}
//
// The Go port produces byte-identical output to opg-core's reference implementation
// for any primitive that does not use floating-point fields. (Commons records never
// do; integers and strings only.)
package hash

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// TransientFields are stripped before canonical serialization per OPG-L §15.5.
// These vary across copies of the same logical record and must not affect identity.
var TransientFields = map[string]bool{
	"modified":        true,
	"content_hash":    true,
	"current_git_ref": true,
}

// Sum returns the canonical preimage and its SHA-256 hash for the given record.
// The hash is prefixed with "sha256:" per OPG-L §15.6.
func Sum(record map[string]any) (preimage []byte, hash string, err error) {
	stripped := stripTransient(record)
	var buf strings.Builder
	if err := writeCanonical(&buf, stripped); err != nil {
		return nil, "", fmt.Errorf("canonicalize: %w", err)
	}
	preimage = []byte(buf.String())
	sum := sha256.Sum256(preimage)
	return preimage, "sha256:" + hex.EncodeToString(sum[:]), nil
}

// Compute is a convenience wrapper returning only the hash string.
func Compute(record map[string]any) (string, error) {
	_, h, err := Sum(record)
	return h, err
}

// stripTransient walks the record (recursively) and removes any object key in
// TransientFields. Returns a deep-cloned tree so the caller's data is untouched.
func stripTransient(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			if TransientFields[k] {
				continue
			}
			out[k] = stripTransient(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = stripTransient(val)
		}
		return out
	default:
		return x
	}
}

// writeCanonical writes RFC-8785-canonical JSON for v into w. Booleans, nulls,
// strings, finite numbers, arrays, and objects are supported. Other types
// (functions, channels, NaN, ±Inf) return errors.
func writeCanonical(w *strings.Builder, v any) error {
	switch x := v.(type) {
	case nil:
		w.WriteString("null")
		return nil
	case bool:
		if x {
			w.WriteString("true")
		} else {
			w.WriteString("false")
		}
		return nil
	case string:
		writeString(w, x)
		return nil
	case int:
		return writeNumber(w, float64(x))
	case int32:
		return writeNumber(w, float64(x))
	case int64:
		return writeNumber(w, float64(x))
	case float32:
		return writeNumber(w, float64(x))
	case float64:
		return writeNumber(w, x)
	case []any:
		w.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				w.WriteByte(',')
			}
			if err := writeCanonical(w, e); err != nil {
				return err
			}
		}
		w.WriteByte(']')
		return nil
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		// RFC 8785: sort by UTF-16 code units. For ASCII keys (the common
		// case here), this matches byte-wise sort. For BMP keys, Go's
		// string compare on UTF-8 also matches UTF-16. Astral-plane keys
		// would diverge; commons records do not use them.
		sort.Strings(keys)
		w.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				w.WriteByte(',')
			}
			writeString(w, k)
			w.WriteByte(':')
			if err := writeCanonical(w, x[k]); err != nil {
				return err
			}
		}
		w.WriteByte('}')
		return nil
	default:
		return fmt.Errorf("canonical: unsupported type %T", v)
	}
}

// writeString emits a JSON-encoded string using RFC 8785 rules: lowercase \uXXXX
// for control chars + the standard short escapes for ", \, /, BS, FF, NL, CR, HT.
func writeString(w *strings.Builder, s string) {
	w.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			w.WriteString(`\"`)
		case '\\':
			w.WriteString(`\\`)
		case '\b':
			w.WriteString(`\b`)
		case '\f':
			w.WriteString(`\f`)
		case '\n':
			w.WriteString(`\n`)
		case '\r':
			w.WriteString(`\r`)
		case '\t':
			w.WriteString(`\t`)
		default:
			if r < 0x20 {
				w.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else if r < 0x80 {
				w.WriteByte(byte(r))
			} else {
				// Pass through as UTF-8 (RFC 8785 §3.2.2.2).
				w.WriteRune(r)
			}
		}
	}
	w.WriteByte('"')
}

// writeNumber emits a number per RFC 8785 §3.2.2.3 (ECMA-262 ToString rules
// for finite numbers). Integers print without trailing ".0". Floats use the
// shortest unambiguous form.
func writeNumber(w *strings.Builder, f float64) error {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return errors.New("canonical: NaN/Inf not allowed in JSON")
	}
	// Integers — print without decimal point.
	if f == math.Trunc(f) && math.Abs(f) < 1e21 {
		w.WriteString(strconv.FormatInt(int64(f), 10))
		return nil
	}
	// Floats — shortest round-trip representation per ECMA-262.
	w.WriteString(strconv.FormatFloat(f, 'g', -1, 64))
	return nil
}
