import React from "react";

/**
 * Silhouette Icon SVG placeholder when initials cannot be derived
 */
const SilhouetteIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ opacity: 0.85, display: "block" }}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/**
 * Extract initials from display name (e.g. "John Doe" -> "JD", "Ramesh" -> "R")
 */
const getInitials = (name) => {
  if (!name || typeof name !== "string") return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * UserAccountHeader - A Gmail-style profile header component.
 * Displays dynamic user avatar and user details sourced from Firebase Authentication.
 * 
 * @param {Object} props
 * @param {Object} props.user - Firebase Auth User object (e.g. currentUser)
 * @param {Object} props.style - Custom container inline styles
 * @param {string} props.className - Custom container class name
 */
export default function UserAccountHeader({ user, style, className }) {
  const displayName = user?.displayName?.trim() || "";
  const email = user?.email?.trim() || "";
  const initials = getInitials(displayName);

  // Generate a distinct gradient based on user name to give customized visual feel
  const getAvatarGradient = (name) => {
    const colors = [
      ["#38bdf8", "#818cf8"], // Aqua / Indigo
      ["#34d399", "#059669"], // Emerald / Green
      ["#fb7185", "#e11d48"], // Rose / Red
      ["#fb923c", "#ea580c"], // Orange / Dark Orange
      ["#a78bfa", "#7c3aed"], // Purple / Violet
      ["#f472b6", "#db2777"], // Pink
    ];
    const hash = name ? name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const pair = colors[hash % colors.length];
    return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
  };

  return (
    <div
      className={`user-account-header ${className || ""}`}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "14px",
        padding: "12px 16px",
        borderRadius: "16px",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        ...style,
      }}
    >
      {/* Left Child: Circular Avatar Container */}
      <div
        className="avatar-container"
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: getAvatarGradient(displayName || email),
          border: "2px solid var(--accent, #38bdf8)",
          boxShadow: "0 0 10px rgba(56, 189, 248, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "16px",
          fontFamily: "inherit",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {initials ? initials : <SilhouetteIcon />}
      </div>

      {/* Right Child: Vertical Text Block */}
      <div
        className="text-block"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          minWidth: 0, // Enable text truncation for very long names/emails
          flex: 1,
        }}
      >
        {/* Title Line: Display Name */}
        <span
          className="user-name"
          style={{
            fontSize: "14px",
            fontWeight: "700",
            color: "var(--text-primary, #ffffff)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
            letterSpacing: "0.01em",
          }}
          title={displayName || "User Display Name"}
        >
          {displayName || "User Display Name"}
        </span>

        {/* Subtitle Line: Email Address */}
        <span
          className="user-email"
          style={{
            fontSize: "11px",
            fontWeight: "400",
            color: "var(--text-muted, #94a3b8)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
            marginTop: "2px",
            letterSpacing: "0.02em",
          }}
          title={email || "user@example.com"}
        >
          {email || "user@example.com"}
        </span>
      </div>
    </div>
  );
}
