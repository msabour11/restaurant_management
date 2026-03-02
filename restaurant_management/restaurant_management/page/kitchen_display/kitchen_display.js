frappe.pages["kitchen-display"].on_page_load = function (wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Kitchen Display",
        single_column: true,
    });

    $(frappe.render_template("kitchen_display")).appendTo(page.body);
    new KitchenDisplay(page);
};

class KitchenDisplay {
    constructor(page) {
        this.page = page;
        this.refresh_interval = null;
        this.orders = [];

        this.setup_clock();
        this.setup_events();
        this.load_orders();
        this.start_auto_refresh();
    }

    setup_clock() {
        this.update_clock();
        setInterval(() => this.update_clock(), 1000);
    }

    update_clock() {
        let now = new Date();
        let time = now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        $("#kds-clock").text(time);
    }

    setup_events() {
        // Fullscreen toggle
        $("#kds-fullscreen").on("click", () => {
            let el = document.documentElement;
            if (!document.fullscreenElement) {
                el.requestFullscreen().catch(() => { });
            } else {
                document.exitFullscreen();
            }
        });
    }

    start_auto_refresh() {
        // Refresh every 10 seconds
        this.refresh_interval = setInterval(() => {
            this.load_orders();
        }, 10000);
    }

    load_orders() {
        frappe.call({
            method: "restaurant_management.restaurant_management.api.get_kitchen_orders",
            callback: (r) => {
                if (r.message) {
                    this.orders = r.message;
                    this.render_orders();
                }
            },
        });
    }

    render_orders() {
        let $container = $("#kds-orders");
        $container.empty();

        if (this.orders.length === 0) {
            $container.html(`
				<div class="kds-empty">
					<i class="fa fa-check-circle fa-4x"></i>
					<h3>All Clear!</h3>
					<p>No pending orders</p>
				</div>
			`);
            $("#kds-order-count").text("0 active");
            return;
        }

        $("#kds-order-count").text(`${this.orders.length} active`);

        this.orders.forEach((order) => {
            let elapsed = this.get_elapsed_time(order.order_date);
            let urgency_class = this.get_urgency_class(elapsed.minutes);

            let items_html = "";
            (order.items || []).forEach((item) => {
                items_html += `
					<div class="kds-item">
						<span class="kds-item-qty">${item.quantity}×</span>
						<span class="kds-item-name">${item.item_name}</span>
					</div>
				`;
            });

            let table_badge = "";
            if (order.order_type === "Dine In" && order.table_number) {
                table_badge = `<span class="kds-table-badge dine-in">🪑 Table ${order.table_number}</span>`;
            } else {
                table_badge = `<span class="kds-table-badge parcel">📦 PARCEL</span>`;
            }

            $container.append(`
				<div class="kds-order-card ${urgency_class}" data-order="${order.name}">
					<div class="kds-order-header">
						<div class="kds-order-id">${order.name}</div>
						${table_badge}
					</div>
					<div class="kds-order-timer">
						<i class="fa fa-clock"></i> ${elapsed.display}
					</div>
					<div class="kds-order-items">
						${items_html}
					</div>
					${order.notes ? `<div class="kds-order-notes"><i class="fa fa-sticky-note"></i> ${order.notes}</div>` : ""}
					<div class="kds-order-actions">
						<button class="btn btn-kds-done" data-order="${order.name}">
							<i class="fa fa-check"></i> Done
						</button>
					</div>
				</div>
			`);
        });

        // Bind done buttons
        $container.find(".btn-kds-done").on("click", (e) => {
            e.stopPropagation();
            let order_name = $(e.currentTarget).data("order");
            this.mark_done(order_name);
        });
    }

    get_elapsed_time(order_date) {
        let now = new Date();
        let order_time = new Date(order_date);
        let diff_ms = now - order_time;
        let minutes = Math.floor(diff_ms / 60000);
        let seconds = Math.floor((diff_ms % 60000) / 1000);

        let display = "";
        if (minutes >= 60) {
            let hours = Math.floor(minutes / 60);
            let mins = minutes % 60;
            display = `${hours}h ${mins}m`;
        } else {
            display = `${minutes}m ${seconds}s`;
        }

        return { minutes, seconds, display };
    }

    get_urgency_class(minutes) {
        if (minutes >= 20) return "urgency-critical";
        if (minutes >= 10) return "urgency-warning";
        return "urgency-normal";
    }

    mark_done(order_name) {
        frappe.call({
            method: "restaurant_management.restaurant_management.api.complete_order",
            args: { order_name: order_name },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    // Animate removal
                    $(`.kds-order-card[data-order="${order_name}"]`)
                        .addClass("kds-done-animation")
                        .fadeOut(500, () => {
                            this.load_orders();
                        });

                    frappe.show_alert({
                        message: __("Order {0} completed!", [order_name]),
                        indicator: "green",
                    });
                }
            },
        });
    }
}
