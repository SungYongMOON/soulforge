"""Durable observer lifecycle must remain independent of native execution."""
import json
import threading
import time
import unittest
from types import SimpleNamespace

import test_hermes_buzz_pilot_background as background_fixture


class HealthTransport(background_fixture.ControlledTransport):
    def __init__(self, *, block_health=False, reject_health=False):
        super().__init__()
        self.health_entered=threading.Event()
        self.health_release=threading.Event()
        if not block_health:self.health_release.set()
        self.reject_health=reject_health
        self.checkpoints=[]

    def capture_health(self,raw):
        self.health_entered.set()
        if not self.health_release.wait(3):raise TimeoutError()
        if self.reject_health:raise OSError('synthetic health storage unavailable')
        packet=json.loads(raw)
        self.checkpoints.append(packet)
        return dict(ok=True,observer_instance_id=packet['observer_instance_id'],phase=packet['phase'])


class CaptureHealthTests(unittest.TestCase):
    setUp=background_fixture.BackgroundTests.setUp
    write_binding=background_fixture.BackgroundTests.write_binding
    message=background_fixture.BackgroundTests.message
    background=background_fixture.BackgroundTests.background

    def live_client(self,transport):
        self.addCleanup(transport.health_release.set)
        client=self.background(transport,capture_health_enabled=True,heartbeat_seconds=.05)
        return client

    def ready(self,client):
        deadline=time.monotonic()+2
        while not client.capture_ready and time.monotonic()<deadline:time.sleep(.005)
        self.assertTrue(client.capture_ready)

    def test_durable_started_precedes_capture_and_closed_follows_drain(self):
        transport=HealthTransport()
        client=self.live_client(transport)
        self.ready(client)
        self.assertEqual(transport.checkpoints[0]['phase'],'started')
        job=self.message(client)
        job.bind_session('actual-session')
        job.final_response('Native final')
        job.final_delivery(SimpleNamespace(success=True,message_id='sent',raw_response={'accepted':True}))
        job.processing_complete()
        self.assertTrue(client.close(3))
        phases=[row['phase'] for row in transport.checkpoints]
        self.assertEqual(phases[-1],'closed')
        self.assertEqual(transport.checkpoints[-1]['pending_operations'],0)
        self.assertIsNone(transport.checkpoints[-1]['gap_reason'])
        self.assertTrue(all(set(row)=={'version','observer_instance_id','phase','observed_at',
            'pending_operations','recorded_operations','gap_reason'} for row in transport.checkpoints))

    def test_checkpoint_storage_block_cannot_hold_an_incoming_message(self):
        transport=HealthTransport(block_health=True)
        client=self.live_client(transport)
        self.assertTrue(transport.health_entered.wait(1))
        started=time.monotonic()
        self.assertIsNone(self.message(client))
        self.assertLess(time.monotonic()-started,.2)
        self.assertFalse(client.capture_ready)
        transport.health_release.set()
        self.ready(client)
        self.assertEqual(client.health()['state'],'incomplete')

    def test_health_failure_does_not_turn_into_execution_failed_event(self):
        transport=HealthTransport(reject_health=True)
        client=self.live_client(transport)
        self.assertTrue(transport.health_entered.wait(1))
        deadline=time.monotonic()+2
        while client.health()['reason'] is None and time.monotonic()<deadline:time.sleep(.005)
        self.assertEqual(client.health()['state'],'incomplete')
        self.assertIsNone(self.message(client))
        self.assertEqual(transport.events,[])

    def test_idle_observer_refreshes_health_without_new_model_or_event(self):
        transport=HealthTransport()
        client=self.live_client(transport)
        self.ready(client)
        deadline=time.monotonic()+1
        while len(transport.checkpoints)<2 and time.monotonic()<deadline:time.sleep(.005)
        self.assertEqual(transport.checkpoints[1]['phase'],'heartbeat')
        self.assertEqual(transport.events,[])


if __name__=='__main__':unittest.main()
