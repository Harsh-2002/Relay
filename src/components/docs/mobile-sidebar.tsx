"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./sidebar";
import type { DocFrontmatter } from "@/types/docs";

interface MobileSidebarProps {
  docs: { slug: string; frontmatter: DocFrontmatter }[];
}

export function MobileSidebar({ docs }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating toggle button - bottom right, hidden on lg+ */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 lg:hidden flex items-center justify-center w-12 h-12 rounded-full bg-accent text-black shadow-lg shadow-accent/25 hover:bg-accent/90 transition-colors cursor-pointer"
        aria-label="Open docs menu"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)}
            />

            {/* Slide-in drawer from left */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-72 bg-bg-primary border-r border-border-primary overflow-y-auto lg:hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border-primary">
                <span className="text-sm font-semibold text-text-primary">
                  Navigation
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  aria-label="Close docs menu"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4" onClick={() => setOpen(false)}>
                <Sidebar docs={docs} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
