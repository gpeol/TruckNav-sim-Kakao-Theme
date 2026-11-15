// Measure the existing summary and telemetry rather than assuming user font scale or wrapping.
export function useTripTelemetryLayout(root: Ref<HTMLElement | null>) {
    let resize: ResizeObserver | undefined;
    let mutation: MutationObserver | undefined;
    function update() {
        const el = root.value;
        if (!el) return;
        const summary = el.querySelector<HTMLElement>('.route-ui.is-navigating .trip-summary');
        const telemetry = el.querySelector<HTMLElement>('.gas-sleep-time');
        el.style.setProperty('--trip-summary-height', String(summary?.getBoundingClientRect().height || 112) + 'px');
        el.style.setProperty('--trip-telemetry-height', String(telemetry?.getBoundingClientRect().height || 0) + 'px');
    }
    function observe() {
        resize?.disconnect();
        if (!root.value) return;
        for (const el of root.value.querySelectorAll('.trip-summary, .gas-sleep-time')) resize?.observe(el);
        update();
    }
    onMounted(() => {
        resize = new ResizeObserver(update);
        mutation = new MutationObserver(observe);
        if (root.value) mutation.observe(root.value, {childList:true,subtree:true});
        observe();
    });
    onUnmounted(() => { resize?.disconnect(); mutation?.disconnect(); });
}
