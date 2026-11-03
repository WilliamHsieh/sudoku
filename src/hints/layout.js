/** Match actual control geometry, not a desktop-only width breakpoint.
 * @param {{left:number,right:number,top:number,bottom:number}} board
 * @param {{left:number,width:number}} controls
 * @param {{width:number,height:number}} viewport
 */
export function hintFrameFor(board, controls, viewport) {
  const side = controls.left >= board.right + 8 && viewport.width - board.right >= 260;
  const left = side ? board.right + 24 : controls.left;
  const top = side ? board.top : board.bottom + 12;
  return {
    mode: /** @type {'side'|'docked'} */ (side ? "side" : "docked"),
    left,
    top,
    width: side ? Math.min(340, viewport.width - 16 - left) : controls.width,
    maxHeight: viewport.height - top - 16,
  };
}
