import { NodeViewWrapper } from "@tiptap/react";

export default function ImageNodeView({ node }) {
  console.log(node.attrs);

  return (
    <NodeViewWrapper className="my-4 text-center">
      <img
        src={node.attrs.src}
        className="mx-auto max-w-[90%] h-auto"
      />

      <div className="mt-2 text-sm text-black">
        {node.attrs.alt}
      </div>
    </NodeViewWrapper>
  );
}