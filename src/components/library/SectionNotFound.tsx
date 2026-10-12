"use client";

import { useParams } from "next/navigation";
import { FileQuestionMark, MapPinOff, SearchX } from "lucide-react";
import { Button, Empty } from "@/components/ui";

const SECTIONS = {
  documents: {
    icon: FileQuestionMark, title: "Document not found", back: "All documents",
    text: "It may have been removed, or it is only shared with owners or the office.",
  },
  info: {
    icon: SearchX, title: "Page not found", back: "Bins & info",
    text: "It may have been deleted. The latest bin days and building information are on Bins & info.",
  },
  local: {
    icon: MapPinOff, title: "Place not found", back: "Local area",
    text: "It may have been deleted.",
  },
} as const;

/** Friendly 404 inside the app shell for Bins & info, Local area and Documents. */
export default function SectionNotFound({ section }: { section: keyof typeof SECTIONS }) {
  const { community } = useParams<{ community: string }>();
  const s = SECTIONS[section];
  return (
    <div className="mx-auto max-w-2xl pt-4 sm:pt-10">
      <Empty title={s.title} icon={s.icon} action={<Button href={`/${community}/${section}`} variant="secondary">{s.back}</Button>}>
        {s.text}
      </Empty>
    </div>
  );
}
