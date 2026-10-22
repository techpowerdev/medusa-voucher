# 04: Retry failed Deliveries and recover missing ones

**What to build:** A scheduled job every 15 minutes runs a workflow that sends again the email Deliveries that failed with fewer than 5 attempts or have been sending for more than 10 minutes, and creates and sends the Delivery of every order with first-time Allocations but no email Delivery, among orders allocated between 7 days and 10 minutes before the given time. A page at a time; one order's error is logged and does not stop the others. The Paid order rule applies on every send. Does nothing when `delivery.automatic` is false. See "Automatic retry and recovery" in the delivery spec.

**Blocked by:** 03 (Start delivery after allocation).

**Status:** ready-for-agent

- [ ] A failed Delivery under 5 attempts is sent again; one at 5 stays failed
- [ ] A Delivery sending for more than 10 minutes is sent again; a younger one is left alone
- [ ] An allocated order with no email Delivery inside the window gets one and is sent; outside the window it is left alone
- [ ] An order that is no longer a Paid order is not sent
- [ ] One order that throws is logged as an error with its reason and does not stop the others
- [ ] With `delivery.automatic: false` the job sends nothing
- [ ] The workflow takes the current time and a page size as input; the job only calls it
- [ ] Tested at the workflow against a real database
