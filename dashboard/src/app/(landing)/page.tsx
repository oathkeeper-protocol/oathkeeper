"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260217_030345_246c0224-10a4-422c-b324-070b7c0eceda.mp4";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.2 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function LandingPage() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "var(--background)",
        overflow: "hidden",
      }}
    >
      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
          opacity: 0.5,
        }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      {/* Gradient overlays */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(10,10,20,0.4) 0%, rgba(10,10,20,0.85) 70%, rgba(10,10,20,1) 100%)",
          zIndex: 1,
        }}
      />

      {/* Hero content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          minHeight: "100vh",
          padding: "0 24px",
          gap: 28,
        }}
      >
        {/* Badge */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="glass-card"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 18px",
            borderRadius: 100,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
            Live on Tenderly VNet · Powered by Chainlink CRE
          </span>
        </motion.div>

        {/* Heading */}
        <motion.h1
          custom={1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            maxWidth: 680,
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 600,
            lineHeight: 1.15,
            margin: 0,
            color: "#fff",
            letterSpacing: "-0.02em",
          }}
        >
          Autonomous SLA Enforcement for Real-World Assets
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          custom={2}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            maxWidth: 540,
            fontSize: 15,
            fontWeight: 400,
            lineHeight: 1.7,
            color: "var(--muted)",
            margin: 0,
          }}
        >
          Chainlink CRE monitors uptime, AI Tribunal Council predicts breaches, and penalties execute on-chain.
          Provider identity verified by World ID.
        </motion.p>

        {/* CTA */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <Link
            href="/dashboard"
            className="btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "13px 32px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              marginTop: 4,
            }}
          >
            Open Dashboard
          </Link>
        </motion.div>

        {/* Tech badges */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            display: "flex",
            gap: 8,
            marginTop: 16,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {["Chainlink CRE", "World ID", "AI Tribunal", "Foundry"].map((tech) => (
            <span
              key={tech}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "rgba(255,255,255,0.3)",
                padding: "5px 12px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.04)",
                letterSpacing: "0.02em",
              }}
            >
              {tech}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
